import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import * as db from './db.js';
import { uid } from './constants.js';
import { extractJob } from './extract.js';
import { parseNlLog, commitNlLog } from './nllog.js';
import { syncCompany, uploadResumeFile, isConfigured as githubConfigured } from './github.js';
import { fetchLinkedInProfile } from './linkedin.js';

// Resume upload: PDF / DOC / DOCX only, 10 MB cap, kept in memory so we can
// stream the buffer straight to GitHub without touching disk.
const RESUME_MIMETYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (RESUME_MIMETYPES.has(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error('Only PDF, DOC, or DOCX files are allowed.'), { status: 400 }));
  },
});

// Timeline attachment upload: images only, 8 MB cap, kept in memory so we can
// write to the filesystem under a stable attachment id.
const ATTACHMENT_MIMETYPES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
]);
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ATTACHMENT_MIMETYPES.has(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error('Only PNG, JPEG, WEBP, or GIF images are allowed.'), { status: 400 }));
  },
});

const EXT_FOR_MIME = {
  'image/png':  '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif':  '.gif',
};

export const routes = Router();

// Tight rate limit on the extraction endpoint — it makes outbound network
// calls and burns LLM tokens, so abuse is expensive in two ways.
const extractLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many extraction requests. Try again in a minute.' },
});

routes.get('/health', (req, res) => {
  res.json({
    persistenceMode: 'sqlite',
    dbPath: db.dbPath(),
    extractionAvailable: Boolean(process.env.OPENROUTER_API_KEY),
    githubSyncAvailable: githubConfigured(),
  });
});

routes.get('/companies', (req, res) => {
  res.json(db.listCompanies());
});

routes.get('/companies/:id', (req, res) => {
  const c = db.getCompany(req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  res.json(c);
});

routes.post('/companies', (req, res) => {
  const created = db.createCompany(req.body || {});
  res.status(201).json(created);
});

routes.put('/companies/:id', (req, res) => {
  const updated = db.updateCompany(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
});

routes.delete('/companies/:id', (req, res) => {
  db.deleteCompany(req.params.id);
  res.status(204).end();
});

routes.post('/companies/reorder', (req, res) => {
  const { orderedIds } = req.body || {};
  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ error: 'orderedIds must be an array' });
  }
  db.reorderCompanies(orderedIds);
  res.status(204).end();
});

// ──────────────────────────────────────────────────────────────────
// Events — append-only log, the structured record AI tools consume
// ──────────────────────────────────────────────────────────────────
// GET /companies/:id/events?kind=&channel=&actor=&after=&before=
routes.get('/companies/:id/events', (req, res) => {
  const { kind, channel, actor, after, before } = req.query;
  const filters = { companyId: req.params.id };
  if (kind) filters.kind = String(kind);
  if (channel) filters.channel = String(channel);
  if (actor) filters.actor = String(actor);
  if (after) filters.after = Number(after);
  if (before) filters.before = Number(before);
  res.json(db.listEvents(filters));
});

// POST /companies/:id/events — append an event
routes.post('/companies/:id/events', (req, res) => {
  const company = db.getCompany(req.params.id);
  if (!company) return res.status(404).json({ error: 'Company not found.' });
  const body = req.body || {};
  if (!body.kind) return res.status(400).json({ error: 'kind is required.' });
  const created = db.createEvent({ ...body, companyId: req.params.id });
  res.status(201).json(created);
});

// GET /companies/:id/timeline — events bundled with attachments
routes.get('/companies/:id/timeline', (req, res) => {
  const company = db.getCompany(req.params.id);
  if (!company) return res.status(404).json({ error: 'Company not found.' });
  res.json(db.listEventsWithAttachments(req.params.id));
});

// POST /companies/:id/timeline — multipart entry: text + optional URL + optional image.
// Persists the event immediately with processing_status='pending' and returns;
// a background worker (see extractor.js) runs the LLM and patches the row.
routes.post('/companies/:id/timeline', (req, res, next) => {
  attachmentUpload.single('image')(req, res, (err) => {
    if (err) return res.status(err.status || 400).json({ error: err.message || 'Upload failed.' });
    next();
  });
}, async (req, res) => {
  try {
    const company = db.getCompany(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found.' });

    const text = (req.body?.text || '').trim();
    const url  = (req.body?.url  || '').trim();
    const file = req.file || null;
    if (!text && !url && !file) {
      return res.status(400).json({ error: 'Provide at least text, a URL, or an image.' });
    }

    // Build initial event details (URL only — summary will be filled in by the worker).
    const details = {};
    if (url) details.url = url;

    // Persist event with placeholder kind. Worker will rewrite kind/actor/channel/summary.
    const event = db.createEvent({
      companyId:        req.params.id,
      kind:             'note',
      actor:            'me',
      channel:          '',
      details,
      notes:            text,
      rawText:          text,
      processingStatus: 'pending',
      timestamp:        Date.now(),
    });

    // Persist attachment if uploaded.
    let attachment = null;
    if (file) {
      const attId = uid();
      const ext   = EXT_FOR_MIME[file.mimetype] || '';
      const relPath = path.join(event.id, attId + ext);
      const absPath = path.join(db.UPLOADS_DIR, relPath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, file.buffer);
      attachment = db.createAttachment({
        id: attId,
        eventId: event.id,
        kind: 'image',
        filename: file.originalname,
        mimetype: file.mimetype,
        sizeBytes: file.size,
        path: relPath.replace(/\\/g, '/'),
      });
    }

    // Wake the worker so single-event entries don't sit for the full poll interval.
    process.nextTick(() => {
      import('./extractor.js').then((m) => m.kickWorker?.()).catch(() => {});
    });

    res.json({
      event: { ...event, attachments: attachment ? [attachment] : [] },
      contact: null,
      stageChanged: null,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Timeline entry failed.' });
  }
});


// Cross-company event query: GET /events?kind=&channel=&actor=&after=&before=
routes.get('/events', (req, res) => {
  const { kind, channel, actor, after, before, companyId } = req.query;
  const filters = {};
  if (companyId) filters.companyId = String(companyId);
  if (kind) filters.kind = String(kind);
  if (channel) filters.channel = String(channel);
  if (actor) filters.actor = String(actor);
  if (after) filters.after = Number(after);
  if (before) filters.before = Number(before);
  res.json(db.listEvents(filters));
});

routes.put('/events/:id', (req, res) => {
  const updated = db.updateEvent(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'not found' });
  res.json(updated);
});

routes.delete('/events/:id', (req, res) => {
  db.deleteEvent(req.params.id);
  res.status(204).end();
});

// ── Contacts ─────────────────────────────────────────────────────────────────
// Sync helper lives in db.js (so the background extractor can call it without
// importing routes). Re-export the same name for the existing callers below.
const syncFlatContactCols = db.syncFlatContactCols;

routes.get('/companies/:id/contacts', (req, res) => {
  if (!db.getCompany(req.params.id)) return res.status(404).json({ error: 'Company not found.' });
  res.json(db.listContacts(req.params.id));
});

routes.post('/companies/:id/contacts', (req, res) => {
  if (!db.getCompany(req.params.id)) return res.status(404).json({ error: 'Company not found.' });
  // Manual-form path: route through upsert so re-adding a person who already
  // exists (e.g. previously LLM-extracted) updates that row instead of
  // creating a duplicate. override=true so user input wins on conflicts.
  const result = db.upsertContact(
    { ...(req.body || {}), companyId: req.params.id },
    { override: true }
  );
  const company = syncFlatContactCols(req.params.id);
  res.status(result.created ? 201 : 200).json({ contact: result.contact, created: result.created, company });
});

routes.put('/companies/:id/contacts/:contactId', (req, res) => {
  if (!db.getCompany(req.params.id)) return res.status(404).json({ error: 'Company not found.' });
  const updated = db.updateContact(req.params.contactId, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Contact not found.' });
  const company = syncFlatContactCols(req.params.id);
  res.json({ contact: updated, company });
});

routes.delete('/companies/:id/contacts/:contactId', (req, res) => {
  db.deleteContact(req.params.contactId);
  const company = syncFlatContactCols(req.params.id);
  res.json({ company });
});

routes.get('/tweaks', (req, res) => {
  res.json(db.getTweaks());
});

routes.put('/tweaks', (req, res) => {
  db.setTweaks(req.body || {});
  res.status(204).end();
});

routes.post('/extract-job', extractLimiter, async (req, res) => {
  try {
    const { url, mode } = req.body || {};
    const result = await extractJob(url, mode === 'ai' ? 'ai' : 'og');
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    // Don't leak internal stack traces to the client.
    res.status(status).json({ error: err.message || 'Extraction failed.' });
  }
});

// Tight rate limit on GitHub sync — each call makes 1-3 outbound GitHub
// requests. Personal-use limits; bump later if multi-user.
const syncLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many sync requests. Try again in a minute.' },
});

routes.post('/github/sync', syncLimiter, async (req, res) => {
  try {
    const { companyId, sourceUrl, sourceText, force } = req.body || {};
    if (!companyId) {
      return res.status(400).json({ error: 'companyId is required.' });
    }
    const company = db.getCompany(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found.' });

    const result = await syncCompany({
      company: { ...company, created_at: company.created_at || Date.now() },
      sourceUrl,
      sourceText,
      force: Boolean(force),
    });
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'GitHub sync failed.' });
  }
});

// ── LinkedIn lookup ───────────────────────────────────────────────────────────
// Tight rate limit — each request is an outbound hit to linkedin.com from
// our IP. Sustained traffic gets us rate-limited or blocked by LinkedIn.
const linkedInLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many LinkedIn lookups. Try again in a minute.' },
});

routes.post('/linkedin-lookup', linkedInLimiter, async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url is required' });
  try {
    const data = await fetchLinkedInProfile(url);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Lookup failed.' });
  }
});

// ── Resume upload ─────────────────────────────────────────────────────────────
// Fires on the Sourced/Networked → Applied transition. Drops the file as-is
// (original filename) into the company's existing GitHub folder, and stores
// the returned URL on the company row so we can skip the modal next time.
routes.post('/companies/:id/resume', (req, res, next) => {
  resumeUpload.single('file')(req, res, (err) => {
    if (err) {
      const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 400);
      return res.status(status).json({ error: err.message || 'Upload failed.' });
    }
    next();
  });
}, async (req, res) => {
  try {
    const company = db.getCompany(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found.' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const { url, path: githubPath } = await uploadResumeFile({
      company: { name: company.name, role: company.role },
      filename: req.file.originalname,
      buffer: req.file.buffer,
    });
    db.updateCompany(company.id, { resumeLink: url });
    res.json({ url, path: githubPath });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Resume upload failed.' });
  }
});

// ── NL Quick Log ──────────────────────────────────────────────────────────────
const nllogLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many NL log requests. Try again in a minute.' },
});

routes.post('/ai/nl-log', nllogLimiter, async (req, res) => {
  const { text } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ error: 'text is required' });
  try {
    const parsed = await parseNlLog(text);
    res.json({ parsed });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Parse failed.' });
  }
});

routes.post('/ai/nl-log/commit', async (req, res) => {
  const { parsed } = req.body || {};
  if (!parsed) return res.status(400).json({ error: 'parsed is required' });
  try {
    const result = commitNlLog(parsed, db);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Commit failed.' });
  }
});

// ── Fitness logs ───────────────────────────────────────────────────────────────
routes.get('/fitness', (req, res) => {
  const user = (req.query.user || 'bharat').toString();
  res.json(db.listFitnessLogs(user));
});

routes.post('/fitness', (req, res) => {
  const { user, date, muscle_kg, fat_kg, water_kg, total_kg, body_fat_pct, notes } = req.body || {};
  if (!date) return res.status(400).json({ error: 'date is required' });
  try {
    const log = db.createFitnessLog({
      id: uid(),
      user: user || 'bharat',
      date,
      muscle_kg:    +muscle_kg    || 0,
      fat_kg:       +fat_kg       || 0,
      water_kg:     +water_kg     || 0,
      total_kg:     +total_kg     || 0,
      body_fat_pct: +body_fat_pct || 0,
      notes,
    });
    res.json(log);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

routes.delete('/fitness/:id', (req, res) => {
  db.deleteFitnessLog(req.params.id);
  res.status(204).end();
});
