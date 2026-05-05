import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_STATUS_LABELS, uid } from './constants.js';

// DB file lives at DB_PATH (defaults to ./data/tracker.db relative to cwd).
// For Cloud Run / container deploys, set DB_PATH to a mounted volume path.
const DB_PATH = process.env.DB_PATH || path.resolve('./data/tracker.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ──────────────────────────────────────────────────────────────────
// Schema
// ──────────────────────────────────────────────────────────────────
// The `companies` table stores the static application record. The
// `events` table stores a timestamped append-only log of everything
// that happens on that application (you applied, they responded, you
// interviewed, etc.). Analytical queries (AI or dashboards) should
// treat `events` as the source of truth for "what happened and when".
db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id                        TEXT PRIMARY KEY,
    name                      TEXT NOT NULL,
    role                      TEXT NOT NULL DEFAULT '',
    statuses                  TEXT NOT NULL DEFAULT '[]',
    next_steps                TEXT NOT NULL DEFAULT '[]',
    blockers                  TEXT NOT NULL DEFAULT '',
    notes                     TEXT NOT NULL DEFAULT '',
    position                  INTEGER NOT NULL,
    created_at                INTEGER NOT NULL,
    updated_at                INTEGER NOT NULL,
    source_url                TEXT NOT NULL DEFAULT '',
    pipeline                  TEXT NOT NULL DEFAULT 'ongoing',
    channel                   TEXT NOT NULL DEFAULT '',
    referral_name             TEXT NOT NULL DEFAULT '',
    referral_relationship     TEXT NOT NULL DEFAULT '',
    hm_name                   TEXT NOT NULL DEFAULT '',
    hm_contacted_directly     INTEGER NOT NULL DEFAULT 0,
    recruiter_name            TEXT NOT NULL DEFAULT '',
    recruiter_company         TEXT NOT NULL DEFAULT '',
    current_stage             TEXT NOT NULL DEFAULT 'sourced',
    resume_link               TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS tweaks (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events (
    id           TEXT PRIMARY KEY,
    company_id   TEXT NOT NULL,
    timestamp    INTEGER NOT NULL,
    actor        TEXT NOT NULL DEFAULT 'me',
    kind         TEXT NOT NULL,
    channel      TEXT NOT NULL DEFAULT '',
    details      TEXT NOT NULL DEFAULT '{}',
    notes        TEXT NOT NULL DEFAULT '',
    created_at   INTEGER NOT NULL,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS contacts (
    id           TEXT PRIMARY KEY,
    company_id   TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'other',
    title        TEXT NOT NULL DEFAULT '',
    first_name   TEXT NOT NULL DEFAULT '',
    last_name    TEXT NOT NULL DEFAULT '',
    linkedin_url TEXT NOT NULL DEFAULT '',
    email        TEXT NOT NULL DEFAULT '',
    notes        TEXT NOT NULL DEFAULT '',
    created_at   INTEGER NOT NULL,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_events_company ON events(company_id);
  CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
  CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind);
  CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id);
  CREATE TABLE IF NOT EXISTS fitness_logs (
    id            TEXT PRIMARY KEY,
    user          TEXT NOT NULL DEFAULT 'bharat',
    date          TEXT NOT NULL,
    muscle_kg     REAL NOT NULL DEFAULT 0,
    fat_kg        REAL NOT NULL DEFAULT 0,
    water_kg      REAL NOT NULL DEFAULT 0,
    total_kg      REAL NOT NULL DEFAULT 0,
    body_fat_pct  REAL NOT NULL DEFAULT 0,
    notes         TEXT NOT NULL DEFAULT '',
    created_at    INTEGER NOT NULL,
    UNIQUE(user, date)
  );
  CREATE TABLE IF NOT EXISTS attachments (
    id          TEXT PRIMARY KEY,
    event_id    TEXT NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'image',
    filename    TEXT NOT NULL,
    mimetype    TEXT NOT NULL,
    size_bytes  INTEGER NOT NULL,
    path        TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_attachments_event ON attachments(event_id);
`);

// Filesystem location for uploaded attachments.
export const UPLOADS_DIR = path.resolve(path.dirname(DB_PATH), 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Migrations for columns added after initial schema. Each block is
// idempotent — skips if the column already exists.
const cols = db.prepare('PRAGMA table_info(companies)').all();
const has = (name) => cols.some((c) => c.name === name);
if (!has('source_url')) db.exec(`ALTER TABLE companies ADD COLUMN source_url TEXT NOT NULL DEFAULT ''`);
if (!has('pipeline')) db.exec(`ALTER TABLE companies ADD COLUMN pipeline TEXT NOT NULL DEFAULT 'ongoing'`);
if (!has('channel')) db.exec(`ALTER TABLE companies ADD COLUMN channel TEXT NOT NULL DEFAULT ''`);
if (!has('referral_name')) db.exec(`ALTER TABLE companies ADD COLUMN referral_name TEXT NOT NULL DEFAULT ''`);
if (!has('referral_relationship')) db.exec(`ALTER TABLE companies ADD COLUMN referral_relationship TEXT NOT NULL DEFAULT ''`);
if (!has('hm_name')) db.exec(`ALTER TABLE companies ADD COLUMN hm_name TEXT NOT NULL DEFAULT ''`);
if (!has('hm_contacted_directly')) db.exec(`ALTER TABLE companies ADD COLUMN hm_contacted_directly INTEGER NOT NULL DEFAULT 0`);
if (!has('recruiter_name')) db.exec(`ALTER TABLE companies ADD COLUMN recruiter_name TEXT NOT NULL DEFAULT ''`);
if (!has('recruiter_company')) db.exec(`ALTER TABLE companies ADD COLUMN recruiter_company TEXT NOT NULL DEFAULT ''`);
if (!has('current_stage')) db.exec(`ALTER TABLE companies ADD COLUMN current_stage TEXT NOT NULL DEFAULT 'sourced'`);
// resume_link stores the GitHub URL of the uploaded resume. Previously a free-text
// "resume version" field — renamed when we added PDF upload on Applied transition.
if (has('resume_version') && !has('resume_link')) {
  db.exec(`ALTER TABLE companies RENAME COLUMN resume_version TO resume_link`);
} else if (!has('resume_link')) {
  db.exec(`ALTER TABLE companies ADD COLUMN resume_link TEXT NOT NULL DEFAULT ''`);
}

// fitness_logs gained per-user support, scale-weight, and body-fat % after the
// initial single-user schema. The old table had UNIQUE(date); the new shape has
// UNIQUE(user, date) so each user owns their own daily row. SQLite can't drop a
// UNIQUE column constraint, so do a one-time table rebuild gated on the absence
// of the `user` column.
const fitnessCols = db.prepare('PRAGMA table_info(fitness_logs)').all();
if (!fitnessCols.some((c) => c.name === 'user')) {
  db.exec(`
    CREATE TABLE fitness_logs_new (
      id            TEXT PRIMARY KEY,
      user          TEXT NOT NULL DEFAULT 'bharat',
      date          TEXT NOT NULL,
      muscle_kg     REAL NOT NULL DEFAULT 0,
      fat_kg        REAL NOT NULL DEFAULT 0,
      water_kg      REAL NOT NULL DEFAULT 0,
      total_kg      REAL NOT NULL DEFAULT 0,
      body_fat_pct  REAL NOT NULL DEFAULT 0,
      notes         TEXT NOT NULL DEFAULT '',
      created_at    INTEGER NOT NULL,
      UNIQUE(user, date)
    );
    INSERT INTO fitness_logs_new (id, user, date, muscle_kg, fat_kg, water_kg, total_kg, body_fat_pct, notes, created_at)
      SELECT id, 'bharat', date, muscle_kg, fat_kg, water_kg, 0, 0, notes, created_at FROM fitness_logs;
    DROP TABLE fitness_logs;
    ALTER TABLE fitness_logs_new RENAME TO fitness_logs;
  `);
}

// source_url on contacts: where the user found this person (a LinkedIn post URL,
// a tweet, an article — the evidence behind "this person is the recruiter").
const contactCols = db.prepare('PRAGMA table_info(contacts)').all();
const hasContactCol = (name) => contactCols.some((c) => c.name === name);
if (!hasContactCol('source_url')) {
  db.exec(`ALTER TABLE contacts ADD COLUMN source_url TEXT NOT NULL DEFAULT ''`);
}
// `established` flips true once a contact has actually responded. Drives the
// green dot on the HM/REC pill on the kanban card.
if (!hasContactCol('established')) {
  db.exec(`ALTER TABLE contacts ADD COLUMN established INTEGER NOT NULL DEFAULT 0`);
}

// Project per-role "any contact established" flags onto companies so the kanban
// card can render the green dot from a single row read.
if (!has('hm_established')) {
  db.exec(`ALTER TABLE companies ADD COLUMN hm_established INTEGER NOT NULL DEFAULT 0`);
}
if (!has('recruiter_established')) {
  db.exec(`ALTER TABLE companies ADD COLUMN recruiter_established INTEGER NOT NULL DEFAULT 0`);
}

// Async LLM enrichment for timeline events. The /timeline POST returns the
// event immediately with status='pending'; a background worker calls the
// parser and patches the row in place. Empty status = legacy/synchronous row.
const eventCols = db.prepare('PRAGMA table_info(events)').all();
const hasEventCol = (name) => eventCols.some((c) => c.name === name);
if (!hasEventCol('processing_status')) {
  db.exec(`ALTER TABLE events ADD COLUMN processing_status TEXT NOT NULL DEFAULT ''`);
}
if (!hasEventCol('processing_error')) {
  db.exec(`ALTER TABLE events ADD COLUMN processing_error TEXT NOT NULL DEFAULT ''`);
}
if (!hasEventCol('raw_text')) {
  db.exec(`ALTER TABLE events ADD COLUMN raw_text TEXT NOT NULL DEFAULT ''`);
}

// Normalise legacy role aliases. The LLM extractor (timeline.js) emits
// role_type='hm', while the contact form uses 'hiring_manager' — both ended
// up in the DB. Canonicalise to 'hiring_manager' so syncFlatContactCols and
// the kanban card pills don't have to know about both spellings.
db.exec(`UPDATE contacts SET role = 'hiring_manager' WHERE role = 'hm'`);
db.exec(`UPDATE contacts SET role = 'recruiter'      WHERE role = 'rec'`);
db.exec(`UPDATE contacts SET role = 'referral'       WHERE role = 'ref'`);

// One-time migration: copy flat contact columns → contacts table
const contactsMigrated = db.prepare("SELECT value FROM tweaks WHERE key = 'contacts_migrated_v1'").get();
if (!contactsMigrated) {
  const allRows = db.prepare('SELECT id, hm_name, recruiter_name, recruiter_company, referral_name, referral_relationship FROM companies').all();
  const insertC = db.prepare(
    `INSERT INTO contacts (id, company_id, role, title, first_name, last_name, linkedin_url, email, notes, created_at)
     VALUES (?, ?, ?, '', ?, '', '', '', ?, ?)`
  );
  const runMigration = db.transaction(() => {
    const now = Date.now();
    for (const c of allRows) {
      if (c.hm_name?.trim())        insertC.run(uid(), c.id, 'hiring_manager', c.hm_name.trim(),       '',                       now);
      if (c.recruiter_name?.trim()) insertC.run(uid(), c.id, 'recruiter',      c.recruiter_name.trim(), c.recruiter_company || '', now);
      if (c.referral_name?.trim())  insertC.run(uid(), c.id, 'referral',       c.referral_name.trim(),  c.referral_relationship || '', now);
    }
    db.prepare("INSERT OR REPLACE INTO tweaks (key, value) VALUES ('contacts_migrated_v1', '1')").run();
  });
  runMigration();
}

// ──────────────────────────────────────────────────────────────────
// Seed data (only on a fresh DB)
// ──────────────────────────────────────────────────────────────────
const defStatuses = () =>
  DEFAULT_STATUS_LABELS.split(',').map((s) => ({ label: s.trim(), checked: false }));

const seedRows = () => {
  const now = Date.now();
  const googleStatuses = DEFAULT_STATUS_LABELS.split(',').map((s, i) => ({
    label: s.trim(),
    checked: i < 3,
  }));
  return [
    {
      id: uid(),
      name: 'Google',
      role: 'TAM',
      statuses: googleStatuses,
      nextSteps: [
        {
          id: 'a1',
          text: 'Create resume',
          children: [
            { id: 'a1a', text: 'Tailor for TAM role', children: [] },
            { id: 'a1b', text: 'Send to recruiter', children: [] },
          ],
        },
        {
          id: 'a2',
          text: 'Find other TAMs',
          children: [{ id: 'a2a', text: 'Learn about role', children: [] }],
        },
      ],
      blockers: 'Need referral contact',
      notes: '',
      position: 0,
      created_at: now,
      updated_at: now,
    },
    { id: uid(), name: 'Meta',       role: 'Solutions Engineer', statuses: defStatuses(), nextSteps: [], blockers: '', notes: '', position: 1, created_at: now, updated_at: now },
    { id: uid(), name: 'Amazon',     role: 'Account Manager',   statuses: defStatuses(), nextSteps: [], blockers: '', notes: '', position: 2, created_at: now, updated_at: now },
    { id: uid(), name: 'Microsoft',  role: 'CSM',               statuses: defStatuses(), nextSteps: [], blockers: '', notes: '', position: 3, created_at: now, updated_at: now },
    { id: uid(), name: 'Salesforce', role: 'AE',                statuses: defStatuses(), nextSteps: [], blockers: '', notes: '', position: 4, created_at: now, updated_at: now },
  ];
};

const { count } = db.prepare('SELECT COUNT(*) as count FROM companies').get();
if (count === 0) {
  const insert = db.prepare(
    `INSERT INTO companies (id, name, role, statuses, next_steps, blockers, notes, position, created_at, updated_at)
     VALUES (@id, @name, @role, @statuses, @next_steps, @blockers, @notes, @position, @created_at, @updated_at)`
  );
  const tx = db.transaction((rows) => {
    for (const r of rows) {
      insert.run({
        ...r,
        statuses: JSON.stringify(r.statuses),
        next_steps: JSON.stringify(r.nextSteps),
      });
    }
  });
  tx(seedRows());
}

// ──────────────────────────────────────────────────────────────────
// Mapping helpers
// ──────────────────────────────────────────────────────────────────
const parseCompany = (row) => ({
  id: row.id,
  name: row.name,
  role: row.role,
  statuses: JSON.parse(row.statuses),
  nextSteps: JSON.parse(row.next_steps),
  blockers: row.blockers,
  notes: row.notes,
  position: row.position,
  sourceUrl: row.source_url || '',
  pipeline: row.pipeline || 'ongoing',
  channel: row.channel || '',
  referralName: row.referral_name || '',
  referralRelationship: row.referral_relationship || '',
  hmName: row.hm_name || '',
  hmContactedDirectly: !!row.hm_contacted_directly,
  recruiterName: row.recruiter_name || '',
  recruiterCompany: row.recruiter_company || '',
  currentStage: row.current_stage || 'sourced',
  resumeLink: row.resume_link || '',
  hmEstablished: !!row.hm_established,
  recruiterEstablished: !!row.recruiter_established,
  createdAt: row.created_at,
});

const parseEvent = (row) => ({
  id: row.id,
  companyId: row.company_id,
  timestamp: row.timestamp,
  actor: row.actor,
  kind: row.kind,
  channel: row.channel || '',
  details: row.details ? JSON.parse(row.details) : {},
  notes: row.notes || '',
  processingStatus: row.processing_status || '',
  processingError:  row.processing_error  || '',
  rawText:          row.raw_text          || '',
  createdAt: row.created_at,
});

// ──────────────────────────────────────────────────────────────────
// Companies: public API
// ──────────────────────────────────────────────────────────────────
export function listCompanies() {
  return db
    .prepare('SELECT * FROM companies ORDER BY position ASC, created_at ASC')
    .all()
    .map(parseCompany);
}

export function getCompany(id) {
  const row = db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
  return row ? parseCompany(row) : null;
}

export function createCompany(input) {
  const now = Date.now();
  const maxRow = db.prepare('SELECT COALESCE(MAX(position), -1) AS max FROM companies').get();
  const position = (maxRow?.max ?? -1) + 1;
  const id = input.id || uid();
  db.prepare(
    `INSERT INTO companies (
       id, name, role, statuses, next_steps, blockers, notes, position,
       created_at, updated_at, source_url, pipeline, channel,
       referral_name, referral_relationship, hm_name, hm_contacted_directly,
       recruiter_name, recruiter_company, current_stage, resume_link
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.name || '',
    input.role || '',
    JSON.stringify(input.statuses || defStatuses()),
    JSON.stringify(input.nextSteps || []),
    input.blockers || '',
    input.notes || '',
    position,
    now,
    now,
    input.sourceUrl || '',
    input.pipeline === 'rejected' ? 'rejected' : 'ongoing',
    input.channel || '',
    input.referralName || '',
    input.referralRelationship || '',
    input.hmName || '',
    input.hmContactedDirectly ? 1 : 0,
    input.recruiterName || '',
    input.recruiterCompany || '',
    input.currentStage || 'sourced',
    input.resumeLink || ''
  );
  return getCompany(id);
}

const FIELD_MAP = {
  name: 'name',
  role: 'role',
  statuses: 'statuses',
  nextSteps: 'next_steps',
  blockers: 'blockers',
  notes: 'notes',
  position: 'position',
  sourceUrl: 'source_url',
  pipeline: 'pipeline',
  channel: 'channel',
  referralName: 'referral_name',
  referralRelationship: 'referral_relationship',
  hmName: 'hm_name',
  hmContactedDirectly: 'hm_contacted_directly',
  hmEstablished: 'hm_established',
  recruiterName: 'recruiter_name',
  recruiterCompany: 'recruiter_company',
  recruiterEstablished: 'recruiter_established',
  currentStage: 'current_stage',
  resumeLink: 'resume_link',
};
const JSON_FIELDS = new Set(['statuses', 'nextSteps']);
const BOOL_FIELDS = new Set(['hmContactedDirectly', 'hmEstablished', 'recruiterEstablished']);

export function updateCompany(id, patch) {
  const keys = Object.keys(patch).filter((k) => FIELD_MAP[k] !== undefined);
  if (!keys.length) return getCompany(id);
  const sets = keys.map((k) => `${FIELD_MAP[k]} = ?`).join(', ');
  const values = keys.map((k) => {
    if (JSON_FIELDS.has(k)) return JSON.stringify(patch[k]);
    if (BOOL_FIELDS.has(k)) return patch[k] ? 1 : 0;
    return patch[k];
  });
  db.prepare(`UPDATE companies SET ${sets}, updated_at = ? WHERE id = ?`).run(
    ...values,
    Date.now(),
    id
  );
  return getCompany(id);
}

export function deleteCompany(id) {
  // ON DELETE CASCADE on events.company_id drops related events.
  db.prepare('DELETE FROM companies WHERE id = ?').run(id);
}

export function reorderCompanies(orderedIds) {
  const stmt = db.prepare('UPDATE companies SET position = ? WHERE id = ?');
  const tx = db.transaction((ids) => {
    ids.forEach((id, i) => stmt.run(i, id));
  });
  tx(orderedIds);
}

// ──────────────────────────────────────────────────────────────────
// Events: public API
// ──────────────────────────────────────────────────────────────────
// The event log is the structured record AI tools consume. Prefer
// creating events for everything semantically meaningful — checkbox
// ticks, status changes, messages sent — so downstream analysis has
// the raw material to correlate tactics with outcomes.
// Same as listEvents but also bundles each event's attachments inline.
// One DB pass per company-scoped call — fine for a single-user app.
export function listEventsWithAttachments(companyId) {
  const events = listEvents({ companyId });
  if (!events.length) return events;
  const eventIds = events.map(e => e.id);
  const placeholders = eventIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM attachments WHERE event_id IN (${placeholders}) ORDER BY created_at ASC`)
    .all(...eventIds);
  const byEvent = new Map();
  for (const r of rows) {
    const att = {
      id: r.id, eventId: r.event_id, kind: r.kind,
      filename: r.filename, mimetype: r.mimetype, sizeBytes: r.size_bytes,
      url: `/uploads/${r.path}`, path: r.path, createdAt: r.created_at,
    };
    if (!byEvent.has(r.event_id)) byEvent.set(r.event_id, []);
    byEvent.get(r.event_id).push(att);
  }
  return events.map(e => ({ ...e, attachments: byEvent.get(e.id) || [] }));
}

export function listEvents({ companyId, kind, channel, actor, after, before } = {}) {
  const where = [];
  const params = [];
  if (companyId) { where.push('company_id = ?'); params.push(companyId); }
  if (kind)      { where.push('kind = ?');       params.push(kind); }
  if (channel)   { where.push('channel = ?');    params.push(channel); }
  if (actor)     { where.push('actor = ?');      params.push(actor); }
  if (after)     { where.push('timestamp >= ?'); params.push(after); }
  if (before)    { where.push('timestamp <= ?'); params.push(before); }
  const sql = `SELECT * FROM events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY timestamp DESC, created_at DESC`;
  return db.prepare(sql).all(...params).map(parseEvent);
}

export function getEvent(id) {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  return row ? parseEvent(row) : null;
}

export function createEvent(input) {
  const now = Date.now();
  const id = input.id || uid();
  db.prepare(
    `INSERT INTO events (id, company_id, timestamp, actor, kind, channel, details, notes, processing_status, raw_text, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.companyId,
    input.timestamp || now,
    input.actor || 'me',
    input.kind,
    input.channel || '',
    JSON.stringify(input.details || {}),
    input.notes || '',
    input.processingStatus || '',
    input.rawText || '',
    now
  );
  return getEvent(id);
}

export function listPendingEvents(limit = 5) {
  return db
    .prepare("SELECT * FROM events WHERE processing_status = 'pending' ORDER BY created_at ASC LIMIT ?")
    .all(limit)
    .map(parseEvent);
}

const EVENT_FIELD_MAP = {
  timestamp: 'timestamp',
  actor: 'actor',
  kind: 'kind',
  channel: 'channel',
  details: 'details',
  notes: 'notes',
  processingStatus: 'processing_status',
  processingError:  'processing_error',
};
const EVENT_JSON_FIELDS = new Set(['details']);

export function updateEvent(id, patch) {
  const keys = Object.keys(patch).filter((k) => EVENT_FIELD_MAP[k] !== undefined);
  if (!keys.length) return getEvent(id);
  const sets = keys.map((k) => `${EVENT_FIELD_MAP[k]} = ?`).join(', ');
  const values = keys.map((k) => (EVENT_JSON_FIELDS.has(k) ? JSON.stringify(patch[k]) : patch[k]));
  db.prepare(`UPDATE events SET ${sets} WHERE id = ?`).run(...values, id);
  return getEvent(id);
}

export function deleteEvent(id) {
  db.prepare('DELETE FROM events WHERE id = ?').run(id);
}

// ──────────────────────────────────────────────────────────────────
// Tweaks
// ──────────────────────────────────────────────────────────────────
export function getTweaks() {
  const rows = db.prepare('SELECT key, value FROM tweaks').all();
  const out = { statusLabels: DEFAULT_STATUS_LABELS, rowDensity: 'comfortable' };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export function setTweaks(patch) {
  const stmt = db.prepare(
    `INSERT INTO tweaks (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  const tx = db.transaction((entries) => {
    for (const [k, v] of entries) stmt.run(k, String(v));
  });
  tx(Object.entries(patch));
}

export function dbPath() {
  return DB_PATH;
}

// ──────────────────────────────────────────────────────────────────
// Contacts: public API
// ──────────────────────────────────────────────────────────────────
const parseContact = (row) => ({
  id:          row.id,
  companyId:   row.company_id,
  role:        row.role        || 'other',
  title:       row.title       || '',
  firstName:   row.first_name  || '',
  lastName:    row.last_name   || '',
  linkedinUrl: row.linkedin_url || '',
  email:       row.email       || '',
  notes:       row.notes       || '',
  sourceUrl:   row.source_url  || '',
  established: !!row.established,
  createdAt:   row.created_at,
});

export function listContacts(companyId) {
  return db
    .prepare('SELECT * FROM contacts WHERE company_id = ? ORDER BY created_at ASC')
    .all(companyId)
    .map(parseContact);
}

export function createContact(input) {
  const now = Date.now();
  const id  = input.id || uid();
  db.prepare(
    `INSERT INTO contacts (id, company_id, role, title, first_name, last_name, linkedin_url, email, notes, source_url, established, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.companyId,
    canonicalContactRole(input.role),
    input.title       || '',
    input.firstName   || '',
    input.lastName    || '',
    input.linkedinUrl || '',
    input.email       || '',
    input.notes       || '',
    input.sourceUrl   || '',
    input.established ? 1 : 0,
    now
  );
  return parseContact(db.prepare('SELECT * FROM contacts WHERE id = ?').get(id));
}

// Normalise a LinkedIn profile URL down to "linkedin.com/in/<slug>" so two
// URLs that differ only by trailing path / query / scheme / www compare equal.
// Falls back to lowercased trimmed input for non-LinkedIn URLs.
export function normalizeLinkedinUrl(raw) {
  if (!raw) return '';
  const cleaned = String(raw).trim();
  if (!cleaned) return '';
  try {
    const u = new URL(cleaned.startsWith('http') ? cleaned : `https://${cleaned}`);
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    if (host.endsWith('linkedin.com')) {
      const m = u.pathname.match(/^\/in\/([^/]+)/i);
      if (m) return `linkedin.com/in/${m[1].toLowerCase()}`;
    }
    return `${host}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return cleaned.toLowerCase();
  }
}

// True iff the two strings differ by at most one insertion / deletion /
// substitution. Used for fuzzy last-name matching to catch typos like
// "Hubbard" vs "Thubbard". O(min(|a|, |b|)).
function withinOneEdit(a, b) {
  if (a === b) return true;
  const lenDiff = Math.abs(a.length - b.length);
  if (lenDiff > 1) return false;
  const [s, t] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0, j = 0, edits = 0;
  while (i < s.length && j < t.length) {
    if (s[i] !== t[j]) {
      if (++edits > 1) return false;
      if (s.length === t.length) { i++; j++; } else { j++; }
    } else { i++; j++; }
  }
  return edits + (t.length - j) <= 1;
}

// Returns true if two contacts almost certainly describe the same person.
// Tries: identical normalised LinkedIn slug, identical email, then a
// last-name-fuzzy + first-name-or-initial match.
function sameContactPerson(a, b) {
  const aSlug = normalizeLinkedinUrl(a.linkedinUrl);
  const bSlug = normalizeLinkedinUrl(b.linkedinUrl);
  if (aSlug && bSlug && aSlug === bSlug) return true;

  const norm = (s) => (s || '').trim().toLowerCase();
  if (a.email && b.email && norm(a.email) === norm(b.email)) return true;

  const aFirst = norm(a.firstName), bFirst = norm(b.firstName);
  const aLast  = norm(a.lastName),  bLast  = norm(b.lastName);
  if (!aLast || !bLast) return false;
  if (!withinOneEdit(aLast, bLast)) return false;
  if (aFirst && bFirst) {
    return aFirst === bFirst || aFirst[0] === bFirst[0];
  }
  return false;
}

// Upsert by (company_id + same-person match). Pass `override: true` from the
// manual contact form so user input wins over an existing LLM-extracted row;
// LLM/extractor callers leave it false so the user's manual edits aren't
// clobbered by automated re-extraction.
// Returns { contact, created: boolean }.
export function upsertContact(input, { override = false } = {}) {
  const all = db.prepare('SELECT * FROM contacts WHERE company_id = ?').all(input.companyId).map(parseContact);
  const probe = {
    linkedinUrl: input.linkedinUrl || '',
    email:       input.email       || '',
    firstName:   input.firstName   || '',
    lastName:    input.lastName    || '',
  };
  const match = all.find((c) => sameContactPerson(c, probe));

  if (!match) return { contact: createContact(input), created: true };

  if (override) {
    // Manual form: user is the source of truth, replace every field they
    // provided (including empties — clearing a field is intentional).
    const patch = {};
    const passThrough = ['title', 'firstName', 'lastName', 'linkedinUrl', 'email', 'notes'];
    for (const k of passThrough) {
      if (Object.prototype.hasOwnProperty.call(input, k)) patch[k] = input[k] ?? '';
    }
    if (input.role) patch.role = canonicalContactRole(input.role);
    if (Object.prototype.hasOwnProperty.call(input, 'established')) patch.established = !!input.established;
    const updated = updateContact(match.id, patch);
    return { contact: updated, created: false };
  }

  // LLM/extractor path: only fill fields that are currently empty so we
  // don't clobber data the user has already curated.
  const patch = {};
  const fillIfEmpty = (k, v) => { if (v && !match[k]) patch[k] = v; };
  fillIfEmpty('title',       input.title);
  fillIfEmpty('linkedinUrl', input.linkedinUrl);
  fillIfEmpty('email',       input.email);
  fillIfEmpty('sourceUrl',   input.sourceUrl);
  fillIfEmpty('role',        input.role && input.role !== 'other' ? canonicalContactRole(input.role) : '');
  if (!Object.keys(patch).length) return { contact: match, created: false };
  const updated = updateContact(match.id, patch);
  // updateContact doesn't know about sourceUrl — handle it directly.
  if (patch.sourceUrl) {
    db.prepare('UPDATE contacts SET source_url = ? WHERE id = ?').run(patch.sourceUrl, match.id);
  }
  return { contact: parseContact(db.prepare('SELECT * FROM contacts WHERE id = ?').get(match.id)), created: false };
}

// Collapse same-person duplicate rows (per company) into one. Picks the
// "best" survivor by a heuristic: most non-empty fields, ties broken by
// the most recent created_at — which works well in practice because
// manually-curated rows have more populated fields than LLM stubs.
export function dedupeContactsForCompany(companyId) {
  const contacts = listContacts(companyId);
  const score = (c) => {
    let s = 0;
    for (const k of ['title', 'firstName', 'lastName', 'linkedinUrl', 'email', 'notes']) {
      if (c[k] && String(c[k]).trim()) s++;
    }
    if (c.role && c.role !== 'other') s++;
    if (c.established) s++;
    return s;
  };

  const groups = []; // [[contact, ...], ...]
  for (const c of contacts) {
    const g = groups.find((grp) => grp.some((x) => sameContactPerson(x, c)));
    if (g) g.push(c);
    else groups.push([c]);
  }

  let removed = 0;
  for (const g of groups) {
    if (g.length < 2) continue;
    g.sort((a, b) => {
      const ds = score(b) - score(a);
      if (ds !== 0) return ds;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    const [keeper, ...losers] = g;
    // Salvage any field the keeper is missing but a loser has.
    const salvage = {};
    for (const k of ['title', 'linkedinUrl', 'email', 'notes']) {
      if (!keeper[k]) {
        const donor = losers.find((l) => l[k]);
        if (donor) salvage[k] = donor[k];
      }
    }
    if (losers.some((l) => l.established) && !keeper.established) salvage.established = true;
    if (Object.keys(salvage).length) updateContact(keeper.id, salvage);
    for (const l of losers) {
      db.prepare('DELETE FROM contacts WHERE id = ?').run(l.id);
      removed++;
    }
  }
  return removed;
}

export function dedupeAllContacts() {
  const ids = db.prepare('SELECT id FROM companies').all().map((r) => r.id);
  let total = 0;
  for (const id of ids) total += dedupeContactsForCompany(id);
  return total;
}

export function updateContact(id, input) {
  const colMap = {
    title:       'title',
    firstName:   'first_name',
    lastName:    'last_name',
    linkedinUrl: 'linkedin_url',
    email:       'email',
    notes:       'notes',
    role:        'role',
    established: 'established',
  };
  const cols = [];
  const vals = [];
  for (const k of Object.keys(colMap)) {
    if (Object.prototype.hasOwnProperty.call(input, k)) {
      cols.push(`${colMap[k]} = ?`);
      if (k === 'established') vals.push(input[k] ? 1 : 0);
      else vals.push(input[k] ?? '');
    }
  }
  if (!cols.length) return parseContact(db.prepare('SELECT * FROM contacts WHERE id = ?').get(id));
  vals.push(id);
  db.prepare(`UPDATE contacts SET ${cols.join(', ')} WHERE id = ?`).run(...vals);
  return parseContact(db.prepare('SELECT * FROM contacts WHERE id = ?').get(id));
}

export function deleteContact(id) {
  db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
}

// Canonicalise a role string from the LLM or form into the value we store.
// Keeps DB reads simple — sync and the kanban card only handle the canonical
// names ('hiring_manager', 'recruiter', 'referral', 'other').
export function canonicalContactRole(raw) {
  const r = (raw || '').toLowerCase();
  if (r === 'hm' || r === 'hiring_manager') return 'hiring_manager';
  if (r === 'rec' || r === 'recruiter')      return 'recruiter';
  if (r === 'ref' || r === 'referral')       return 'referral';
  return 'other';
}

// Project per-role contact info onto the company row so the kanban card can
// render its pills + green-dot status from a single row read. Called after
// every contact create/update/delete and on boot for every company.
export function syncFlatContactCols(companyId) {
  const contacts = listContacts(companyId);
  const hm  = contacts.find((c) => c.role === 'hiring_manager');
  const rec = contacts.find((c) => c.role === 'recruiter');
  const ref = contacts.find((c) => c.role === 'referral');
  const fullName = (c) => [c?.firstName, c?.lastName].filter(Boolean).join(' ');
  const anyEstablished = (role) => contacts.some((c) => c.role === role && c.established);
  return updateCompany(companyId, {
    hmName:               fullName(hm),
    recruiterName:        fullName(rec),
    recruiterCompany:     rec?.notes || '',
    referralName:         fullName(ref),
    referralRelationship: ref?.notes || '',
    hmEstablished:        anyEstablished('hiring_manager'),
    recruiterEstablished: anyEstablished('recruiter'),
  });
}

export function resyncAllFlatContactCols() {
  const ids = db.prepare('SELECT id FROM companies').all().map((r) => r.id);
  for (const id of ids) syncFlatContactCols(id);
  return ids.length;
}

// ── Fitness logs ───────────────────────────────────────────────────────────────
export function listFitnessLogs(user = 'bharat') {
  return db.prepare('SELECT * FROM fitness_logs WHERE user = ? ORDER BY date ASC').all(user);
}

export function createFitnessLog({ id, user, date, muscle_kg, fat_kg, water_kg, total_kg, body_fat_pct, notes }) {
  const u = user || 'bharat';
  db.prepare(
    `INSERT INTO fitness_logs (id, user, date, muscle_kg, fat_kg, water_kg, total_kg, body_fat_pct, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user, date) DO UPDATE SET muscle_kg=excluded.muscle_kg, fat_kg=excluded.fat_kg,
       water_kg=excluded.water_kg, total_kg=excluded.total_kg, body_fat_pct=excluded.body_fat_pct,
       notes=excluded.notes`
  ).run(id, u, date, muscle_kg, fat_kg, water_kg, total_kg, body_fat_pct, notes || '', Date.now());
  return db.prepare('SELECT * FROM fitness_logs WHERE user = ? AND date = ?').get(u, date);
}

export function deleteFitnessLog(id) {
  db.prepare('DELETE FROM fitness_logs WHERE id = ?').run(id);
}

// ── Attachments ────────────────────────────────────────────────────────────────
const parseAttachment = (row) => row ? ({
  id:         row.id,
  eventId:    row.event_id,
  kind:       row.kind,
  filename:   row.filename,
  mimetype:   row.mimetype,
  sizeBytes:  row.size_bytes,
  // url is what the frontend uses; path is the on-disk location relative to UPLOADS_DIR.
  url:        `/uploads/${row.path}`,
  path:       row.path,
  createdAt:  row.created_at,
}) : null;

export function listAttachmentsByEvent(eventId) {
  return db
    .prepare('SELECT * FROM attachments WHERE event_id = ? ORDER BY created_at ASC')
    .all(eventId)
    .map(parseAttachment);
}

export function listAttachmentsByCompany(companyId) {
  return db.prepare(`
    SELECT a.* FROM attachments a
    JOIN events e ON e.id = a.event_id
    WHERE e.company_id = ?
    ORDER BY a.created_at ASC
  `).all(companyId).map(parseAttachment);
}

export function createAttachment({ id, eventId, kind, filename, mimetype, sizeBytes, path: relPath }) {
  db.prepare(
    `INSERT INTO attachments (id, event_id, kind, filename, mimetype, size_bytes, path, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, eventId, kind || 'image', filename, mimetype, sizeBytes, relPath, Date.now());
  return parseAttachment(db.prepare('SELECT * FROM attachments WHERE id = ?').get(id));
}

export function deleteAttachment(id) {
  db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
}
