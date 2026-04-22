import { DEFAULT_STATUS_LABELS, uid } from './theme.js';

const KEY_COMPANIES = 'job_tracker_companies';
const KEY_TWEAKS = 'job_tracker_tweaks';

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

const persist = () => {
  try {
    localStorage.setItem(KEY_COMPANIES, JSON.stringify(companies));
  } catch {}
};

const persistTweaks = () => {
  try {
    localStorage.setItem(KEY_TWEAKS, JSON.stringify(tweaks));
  } catch {}
};

export function initDb() {
  try {
    const raw = localStorage.getItem(KEY_COMPANIES);
    const rawTweaks = localStorage.getItem(KEY_TWEAKS);
    companies = raw ? JSON.parse(raw) : SEED();
    tweaks = rawTweaks ? { ...tweaks, ...JSON.parse(rawTweaks) } : tweaks;
    if (!companies.length) { companies = SEED(); persist(); }
    persistenceMode = 'localstorage';
  } catch {
    companies = SEED();
    persistenceMode = 'memory';
  }
  return Promise.resolve({ persistenceMode });
}

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
