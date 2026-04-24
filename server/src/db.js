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
    resume_version            TEXT NOT NULL DEFAULT ''
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
`);

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
if (!has('resume_version')) db.exec(`ALTER TABLE companies ADD COLUMN resume_version TEXT NOT NULL DEFAULT ''`);

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
  resumeVersion: row.resume_version || '',
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
       recruiter_name, recruiter_company, current_stage, resume_version
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
    input.resumeVersion || ''
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
  resumeVersion: 'resume_version',
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
    `INSERT INTO contacts (id, company_id, role, title, first_name, last_name, linkedin_url, email, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    now
  );
  return parseContact(db.prepare('SELECT * FROM contacts WHERE id = ?').get(id));
}

export function deleteContact(id) {
  db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
}
