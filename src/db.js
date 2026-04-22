import { DEFAULT_STATUS_LABELS, uid } from './theme.js';

const DB_NAME = 'job_tracker_v2';
const DB_VERSION = 1;
const STORE = 'kv';
const KEY_COMPANIES = 'companies';
const KEY_TWEAKS = 'tweaks';

let idb = null;
let companies = [];
let tweaks = { statusLabels: DEFAULT_STATUS_LABELS, rowDensity: 'comfortable' };
let persistenceMode = 'unknown';

const defStatuses = () =>
  DEFAULT_STATUS_LABELS.split(',').map((s) => ({ label: s.trim(), checked: false }));

const SEED = () => {
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
      blockers: 'Need referral contact', notes: '', position: 0,
    },
    { id: uid(), name: 'Meta',       role: 'Solutions Engineer', statuses: defStatuses(), nextSteps: [], blockers: '', notes: '', position: 1 },
    { id: uid(), name: 'Amazon',     role: 'Account Manager',   statuses: defStatuses(), nextSteps: [], blockers: '', notes: '', position: 2 },
    { id: uid(), name: 'Microsoft',  role: 'CSM',               statuses: defStatuses(), nextSteps: [], blockers: '', notes: '', position: 3 },
    { id: uid(), name: 'Salesforce', role: 'AE',                statuses: defStatuses(), nextSteps: [], blockers: '', notes: '', position: 4 },
  ];
};

// --- IndexedDB helpers ---
const openIdb = () =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE);
      }
    };
  });

const idbGet = (key) =>
  new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });

const idbPut = (key, value) =>
  new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).put(value, key);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
  });

// --- persistence write-through ---
const persist = () => {
  if (persistenceMode === 'indexeddb') {
    idbPut(KEY_COMPANIES, companies).catch((e) =>
      console.error('IDB write failed for companies:', e)
    );
  } else if (persistenceMode === 'localstorage') {
    try {
      localStorage.setItem(`${DB_NAME}_${KEY_COMPANIES}`, JSON.stringify(companies));
    } catch (e) {
      console.error('localStorage write failed:', e);
    }
  }
};

const persistTweaks = () => {
  if (persistenceMode === 'indexeddb') {
    idbPut(KEY_TWEAKS, tweaks).catch((e) =>
      console.error('IDB write failed for tweaks:', e)
    );
  } else if (persistenceMode === 'localstorage') {
    try {
      localStorage.setItem(`${DB_NAME}_${KEY_TWEAKS}`, JSON.stringify(tweaks));
    } catch {}
  }
};

// --- init: try IDB → localStorage → memory ---
export async function initDb() {
  try {
    idb = await openIdb();
    const [companiesData, tweaksData] = await Promise.all([
      idbGet(KEY_COMPANIES),
      idbGet(KEY_TWEAKS),
    ]);
    companies = Array.isArray(companiesData) && companiesData.length ? companiesData : SEED();
    tweaks = tweaksData ? { ...tweaks, ...tweaksData } : tweaks;
    persistenceMode = 'indexeddb';
    if (!companiesData) await idbPut(KEY_COMPANIES, companies);
    return { persistenceMode };
  } catch (idbErr) {
    console.warn('IndexedDB unavailable, falling back to localStorage.', idbErr);
  }

  try {
    const raw = localStorage.getItem(`${DB_NAME}_${KEY_COMPANIES}`);
    const rawTweaks = localStorage.getItem(`${DB_NAME}_${KEY_TWEAKS}`);
    const parsed = raw ? JSON.parse(raw) : null;
    companies = Array.isArray(parsed) && parsed.length ? parsed : SEED();
    tweaks = rawTweaks ? { ...tweaks, ...JSON.parse(rawTweaks) } : tweaks;
    persistenceMode = 'localstorage';
    if (!raw) localStorage.setItem(`${DB_NAME}_${KEY_COMPANIES}`, JSON.stringify(companies));
    return { persistenceMode };
  } catch (lsErr) {
    console.warn('localStorage unavailable, falling back to in-memory.', lsErr);
  }

  companies = SEED();
  persistenceMode = 'memory';
  return { persistenceMode };
}

// --- public API (sync; writes fire-and-forget to storage) ---
export function listCompanies() {
  return [...companies].sort((a, b) => a.position - b.position);
}

export function createCompany(c) {
  const maxPos = companies.reduce((m, x) => Math.max(m, x.position), -1);
  const entry = { ...c, position: maxPos + 1 };
  companies.push(entry);
  persist();
  return entry;
}

export function updateCompany(id, patch) {
  companies = companies.map((c) => (c.id === id ? { ...c, ...patch } : c));
  persist();
}

export function deleteCompany(id) {
  companies = companies.filter((c) => c.id !== id);
  persist();
}

export function reorderCompanies(orderedIds) {
  orderedIds.forEach((id, i) => {
    const c = companies.find((x) => x.id === id);
    if (c) c.position = i;
  });
  persist();
}

export function getTweaks() {
  return { ...tweaks };
}

export function setTweaks(patch) {
  tweaks = { ...tweaks, ...patch };
  persistTweaks();
}

export function getPersistenceMode() {
  return persistenceMode;
}
