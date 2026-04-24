import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as db from './db.js';
import { extractJob } from './extract.js';
import { parseNlLog, commitNlLog } from './nllog.js';
import { syncCompany, isConfigured as githubConfigured } from './github.js';

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

routes.get('/tweaks', (req, res) => {
  res.json(db.getTweaks());
});

routes.put('/tweaks', (req, res) => {
  db.setTweaks(req.body || {});
  res.status(204).end();
});

routes.post('/extract-job', extractLimiter, async (req, res) => {
  try {
    const { url } = req.body || {};
    const result = await extractJob(url);
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
