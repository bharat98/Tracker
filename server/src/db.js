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

db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT '',
    statuses    TEXT NOT NULL DEFAULT '[]',
    next_steps  TEXT NOT NULL DEFAULT '[]',
    blockers    TEXT NOT NULL DEFAULT '',
    notes       TEXT NOT NULL DEFAULT '',
    position    INTEGER NOT NULL,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    source_url  TEXT NOT NULL DEFAULT '',
    pipeline    TEXT NOT NULL DEFAULT 'ongoing'
  );
  CREATE TABLE IF NOT EXISTS tweaks (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Migrations for columns added after initial schema.
const cols = db.prepare('PRAGMA table_info(companies)').all();
if (!cols.some((c) => c.name === 'source_url')) {
  db.exec(`ALTER TABLE companies ADD COLUMN source_url TEXT NOT NULL DEFAULT ''`);
}
if (!cols.some((c) => c.name === 'pipeline')) {
  db.exec(`ALTER TABLE companies ADD COLUMN pipeline TEXT NOT NULL DEFAULT 'ongoing'`);
}

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
      id: uid(), name: 'Google', role: 'TAM',
      statuses: googleStatuses,
      nextSteps: [
        { id: 'a1', text: 'Create resume', children: [
          { id: 'a1a', text: 'Tailor for TAM role', children: [] },
          { id: 'a1b', text: 'Send to recruiter', children: [] },
        ]},
        { id: 'a2', text: 'Find other TAMs', children: [
          { id: 'a2a', text: 'Learn about role', children: [] },
        ]},
      ],
      blockers: 'Need referral contact', notes: '', position: 0, created_at: now, updated_at: now,
    },
    { id: uid(), name: 'Meta',       role: 'Solutions Engineer', statuses: defStatuses(), nextSteps: [], blockers: '', notes: '', position: 1, created_at: now, updated_at: now },
    { id: uid(), name: 'Amazon',     role: 'Account Manager',   statuses: defStatuses(), nextSteps: [], blockers: '', notes: '', position: 2, created_at: now, updated_at: now },
    { id: uid(), name: 'Microsoft',  role: 'CSM',               statuses: defStatuses(), nextSteps: [], blockers: '', notes: '', position: 3, created_at: now, updated_at: now },
    { id: uid(), name: 'Salesforce', role: 'AE',                statuses: defStatuses(), nextSteps: [], blockers: '', notes: '', position: 4, created_at: now, updated_at: now },
  ];
};

// Seed on first run
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

// --- Mapping helpers ---
const parseRow = (row) => ({
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
});

// --- Public API (used by HTTP routes today; MCP server tomorrow) ---
export function listCompanies() {
  return db
    .prepare('SELECT * FROM companies ORDER BY position ASC, created_at ASC')
    .all()
    .map(parseRow);
}

export function getCompany(id) {
  const row = db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
  return row ? parseRow(row) : null;
}

export function createCompany(input) {
  const now = Date.now();
  const maxRow = db.prepare('SELECT COALESCE(MAX(position), -1) AS max FROM companies').get();
  const position = (maxRow?.max ?? -1) + 1;
  const id = input.id || uid();
  db.prepare(
    `INSERT INTO companies (id, name, role, statuses, next_steps, blockers, notes, position, created_at, updated_at, source_url, pipeline)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    input.pipeline === 'rejected' ? 'rejected' : 'ongoing'
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
};
const JSON_FIELDS = new Set(['statuses', 'nextSteps']);

export function updateCompany(id, patch) {
  const keys = Object.keys(patch).filter((k) => FIELD_MAP[k] !== undefined);
  if (!keys.length) return getCompany(id);
  const sets = keys.map((k) => `${FIELD_MAP[k]} = ?`).join(', ');
  const values = keys.map((k) => (JSON_FIELDS.has(k) ? JSON.stringify(patch[k]) : patch[k]));
  db.prepare(`UPDATE companies SET ${sets}, updated_at = ? WHERE id = ?`).run(
    ...values,
    Date.now(),
    id
  );
  return getCompany(id);
}

export function deleteCompany(id) {
  db.prepare('DELETE FROM companies WHERE id = ?').run(id);
}

export function reorderCompanies(orderedIds) {
  const stmt = db.prepare('UPDATE companies SET position = ? WHERE id = ?');
  const tx = db.transaction((ids) => {
    ids.forEach((id, i) => stmt.run(i, id));
  });
  tx(orderedIds);
}

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
