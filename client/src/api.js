const BASE = import.meta.env.VITE_API_URL || '/api';

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let parsed = null;
    const text = await res.text().catch(() => '');
    try { parsed = JSON.parse(text); } catch {}
    const err = new Error(parsed?.error || `${method} ${path} → ${res.status}`);
    err.status = res.status;
    err.body = parsed;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function initDb() {
  // Probe the backend so the UI can show a banner if it's unreachable,
  // and surface which optional features (extraction, GitHub) are wired up.
  try {
    const health = await request('GET', '/health');
    return {
      persistenceMode: health.persistenceMode,
      extractionAvailable: Boolean(health.extractionAvailable),
      githubSyncAvailable: Boolean(health.githubSyncAvailable),
    };
  } catch (err) {
    console.error('Backend unreachable:', err);
    return {
      persistenceMode: 'offline',
      extractionAvailable: false,
      githubSyncAvailable: false,
    };
  }
}

export const extractJob = (url, mode = 'og') => request('POST', '/extract-job', { url, mode });

export const syncToGithub = ({ companyId, sourceUrl, sourceText, force }) =>
  request('POST', '/github/sync', { companyId, sourceUrl, sourceText, force: !!force });

export const listCompanies = () => request('GET', '/companies');
export const createCompany = (c) => request('POST', '/companies', c);
export const updateCompany = (id, patch) => request('PUT', `/companies/${id}`, patch);
export const deleteCompany = (id) => request('DELETE', `/companies/${id}`);
export const reorderCompanies = (orderedIds) =>
  request('POST', '/companies/reorder', { orderedIds });

// Events — append-only structured log per company.
// Filters: { kind, channel, actor, after, before }
export const listEvents = (companyId, filters = {}) => {
  const qs = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== '')
  ).toString();
  const path = companyId
    ? `/companies/${companyId}/events${qs ? `?${qs}` : ''}`
    : `/events${qs ? `?${qs}` : ''}`;
  return request('GET', path);
};
export const createEvent = (companyId, event) =>
  request('POST', `/companies/${companyId}/events`, event);
export const updateEvent = (id, patch) => request('PUT', `/events/${id}`, patch);
export const deleteEvent = (id) => request('DELETE', `/events/${id}`);

export const getTweaks = () => request('GET', '/tweaks');
export const setTweaks = (patch) => request('PUT', '/tweaks', patch);

export const nlLog = (text) => request('POST', '/ai/nl-log', { text });
export const nlLogCommit = (parsed) => request('POST', '/ai/nl-log/commit', { parsed });

export const fetchLinkedIn = (url) => request('POST', '/linkedin-lookup', { url });

export const listTimeline = (companyId) => request('GET', `/companies/${companyId}/timeline`);

export async function postTimelineEntry(companyId, { text, url, image }) {
  const fd = new FormData();
  if (text)  fd.append('text', text);
  if (url)   fd.append('url',  url);
  if (image) fd.append('image', image, image.name);
  const res = await fetch(`${BASE}/companies/${companyId}/timeline`, { method: 'POST', body: fd });
  if (!res.ok) {
    let parsed = null;
    const t = await res.text().catch(() => '');
    try { parsed = JSON.parse(t); } catch {}
    const err = new Error(parsed?.error || `Timeline entry → ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const listContacts  = (companyId)             => request('GET',    `/companies/${companyId}/contacts`);
export const createContact = (companyId, contact)    => request('POST',   `/companies/${companyId}/contacts`, contact);
export const deleteContact = (companyId, contactId)  => request('DELETE', `/companies/${companyId}/contacts/${contactId}`);

export const listFitness = () => request('GET', '/fitness');
export const createFitnessLog = (log) => request('POST', '/fitness', log);
export const deleteFitnessLog = (id) => request('DELETE', `/fitness/${id}`);

export async function uploadResume(companyId, file) {
  const fd = new FormData();
  fd.append('file', file, file.name);
  const res = await fetch(`${BASE}/companies/${companyId}/resume`, { method: 'POST', body: fd });
  if (!res.ok) {
    let parsed = null;
    const text = await res.text().catch(() => '');
    try { parsed = JSON.parse(text); } catch {}
    const err = new Error(parsed?.error || `Upload → ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}
