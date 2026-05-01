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
if (!contactCols.some((c) => c.name === 'source_url')) {
  db.exec(`ALTER TABLE contacts ADD COLUMN source_url TEXT NOT NULL DEFAULT ''`);
}

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
  recruiterName: 'recruiter_name',
  recruiterCompany: 'recruiter_company',
  currentStage: 'current_stage',
  resumeLink: 'resume_link',
};
const JSON_FIELDS = new Set(['statuses', 'nextSteps']);
const BOOL_FIELDS = new Set(['hmContactedDirectly']);

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
    `INSERT INTO events (id, company_id, timestamp, actor, kind, channel, details, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.companyId,
    input.timestamp || now,
    input.actor || 'me',
    input.kind,
    input.channel || '',
    JSON.stringify(input.details || {}),
    input.notes || '',
    now
  );
  return getEvent(id);
}

const EVENT_FIELD_MAP = {
  timestamp: 'timestamp',
  actor: 'actor',
  kind: 'kind',
  channel: 'channel',
  details: 'details',
  notes: 'notes',
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
    `INSERT INTO contacts (id, company_id, role, title, first_name, last_name, linkedin_url, email, notes, source_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.companyId,
    input.role        || 'other',
    input.title       || '',
    input.firstName   || '',
    input.lastName    || '',
    input.linkedinUrl || '',
    input.email       || '',
    input.notes       || '',
    input.sourceUrl   || '',
    now
  );
  return parseContact(db.prepare('SELECT * FROM contacts WHERE id = ?').get(id));
}

// Upsert by (company_id + first/last name OR linkedin_url OR email).
// Returns { contact, created: boolean }.
export function upsertContact(input) {
  const all = db.prepare('SELECT * FROM contacts WHERE company_id = ?').all(input.companyId).map(parseContact);
  const norm = (s) => (s || '').trim().toLowerCase();

  const match = all.find((c) => {
    if (input.linkedinUrl && norm(c.linkedinUrl) === norm(input.linkedinUrl)) return true;
    if (input.email && norm(c.email) === norm(input.email)) return true;
    if (input.firstName && input.lastName &&
        norm(c.firstName) === norm(input.firstName) &&
        norm(c.lastName)  === norm(input.lastName)) return true;
    return false;
  });

  if (match) {
    // Patch only fields that arrive non-empty so we don't clobber existing data.
    const patch = {};
    const keep = (k, v) => { if (v && !match[k]) patch[k] = v; };
    keep('title',       input.title);
    keep('linkedinUrl', input.linkedinUrl);
    keep('email',       input.email);
    keep('sourceUrl',   input.sourceUrl);
    keep('role',        input.role !== 'other' ? input.role : '');
    if (Object.keys(patch).length) {
      const cols = [];
      const vals = [];
      const colMap = { title: 'title', linkedinUrl: 'linkedin_url', email: 'email', sourceUrl: 'source_url', role: 'role' };
      for (const k of Object.keys(patch)) {
        cols.push(`${colMap[k]} = ?`);
        vals.push(patch[k]);
      }
      vals.push(match.id);
      db.prepare(`UPDATE contacts SET ${cols.join(', ')} WHERE id = ?`).run(...vals);
    }
    return { contact: parseContact(db.prepare('SELECT * FROM contacts WHERE id = ?').get(match.id)), created: false };
  }
  return { contact: createContact(input), created: true };
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
  };
  const cols = [];
  const vals = [];
  for (const k of Object.keys(colMap)) {
    if (Object.prototype.hasOwnProperty.call(input, k)) {
      cols.push(`${colMap[k]} = ?`);
      vals.push(input[k] ?? '');
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
