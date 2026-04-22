import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { DEFAULT_STATUS_LABELS, uid } from './theme.js';

let db = null;
let persistenceMode = 'unknown'; // 'opfs' | 'memory'
let initPromise = null;

const SCHEMA = `
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
    updated_at  INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tweaks (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

const defStatuses = () =>
  DEFAULT_STATUS_LABELS.split(',').map((s) => ({ label: s.trim(), checked: false }));

const seed = () => {
  const now = Date.now();
  const googleStatuses = DEFAULT_STATUS_LABELS.split(',').map((s, i) => ({
    label: s.trim(),
    checked: i < 3,
  }));
  const rows = [
    {
      id: uid(),
      name: 'Google',
      role: 'TAM',
      statuses: googleStatuses,
      next_steps: [
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
    },
    { id: uid(), name: 'Meta', role: 'Solutions Engineer' },
    { id: uid(), name: 'Amazon', role: 'Account Manager' },
    { id: uid(), name: 'Microsoft', role: 'CSM' },
    { id: uid(), name: 'Salesforce', role: 'AE' },
  ];

  db.exec('BEGIN');
  rows.forEach((r, i) => {
    db.exec({
      sql: `INSERT INTO companies
            (id, name, role, statuses, next_steps, blockers, notes, position, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [
        r.id,
        r.name,
        r.role || '',
        JSON.stringify(r.statuses || defStatuses()),
        JSON.stringify(r.next_steps || []),
        r.blockers || '',
        r.notes || '',
        i,
        now,
        now,
      ],
    });
  });
  db.exec('COMMIT');
};

export function initDb() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const sqlite3 = await sqlite3InitModule({
      print: () => {},
      printErr: console.error,
    });

    try {
      const poolUtil = await sqlite3.installOpfsSAHPoolVfs({
        name: 'job-tracker-sahpool',
        initialCapacity: 4,
      });
      db = new poolUtil.OpfsSAHPoolDb('/tracker.db');
      persistenceMode = 'opfs';
    } catch (err) {
      console.warn('OPFS SAH not available, falling back to in-memory DB.', err);
      db = new sqlite3.oo1.DB(':memory:', 'ct');
      persistenceMode = 'memory';
    }

    db.exec(SCHEMA);

    const [{ count }] = db.selectObjects('SELECT COUNT(*) as count FROM companies');
    if (count === 0) seed();

    return { persistenceMode };
  })();
  return initPromise;
}

const parseCompany = (row) => ({
  id: row.id,
  name: row.name,
  role: row.role,
  statuses: JSON.parse(row.statuses),
  nextSteps: JSON.parse(row.next_steps),
  blockers: row.blockers,
  notes: row.notes,
  position: row.position,
});

export function listCompanies() {
  const rows = db.selectObjects(
    'SELECT * FROM companies ORDER BY position ASC, created_at ASC'
  );
  return rows.map(parseCompany);
}

export function createCompany(c) {
  const now = Date.now();
  const [{ max }] = db.selectObjects('SELECT COALESCE(MAX(position), -1) as max FROM companies');
  const id = c.id || uid();
  const position = (max ?? -1) + 1;
  db.exec({
    sql: `INSERT INTO companies
          (id, name, role, statuses, next_steps, blockers, notes, position, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    bind: [
      id,
      c.name || '',
      c.role || '',
      JSON.stringify(c.statuses || defStatuses()),
      JSON.stringify(c.nextSteps || []),
      c.blockers || '',
      c.notes || '',
      position,
      now,
      now,
    ],
  });
  return { ...c, id, position };
}

const FIELD_MAP = {
  name: 'name',
  role: 'role',
  statuses: 'statuses',
  nextSteps: 'next_steps',
  blockers: 'blockers',
  notes: 'notes',
  position: 'position',
};
const JSON_FIELDS = new Set(['statuses', 'nextSteps']);

export function updateCompany(id, patch) {
  const keys = Object.keys(patch).filter((k) => FIELD_MAP[k] !== undefined);
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${FIELD_MAP[k]} = ?`).join(', ');
  const values = keys.map((k) => (JSON_FIELDS.has(k) ? JSON.stringify(patch[k]) : patch[k]));
  db.exec({
    sql: `UPDATE companies SET ${sets}, updated_at = ? WHERE id = ?`,
    bind: [...values, Date.now(), id],
  });
}

export function deleteCompany(id) {
  db.exec({ sql: 'DELETE FROM companies WHERE id = ?', bind: [id] });
}

export function reorderCompanies(orderedIds) {
  db.exec('BEGIN');
  orderedIds.forEach((id, i) => {
    db.exec({ sql: 'UPDATE companies SET position = ? WHERE id = ?', bind: [i, id] });
  });
  db.exec('COMMIT');
}

export function getTweaks() {
  const rows = db.selectObjects('SELECT key, value FROM tweaks');
  const out = { statusLabels: DEFAULT_STATUS_LABELS, rowDensity: 'comfortable' };
  rows.forEach((r) => {
    out[r.key] = r.value;
  });
  return out;
}

export function setTweaks(patch) {
  db.exec('BEGIN');
  Object.entries(patch).forEach(([key, value]) => {
    db.exec({
      sql: `INSERT INTO tweaks (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      bind: [key, String(value)],
    });
  });
  db.exec('COMMIT');
}

export function getPersistenceMode() {
  return persistenceMode;
}
