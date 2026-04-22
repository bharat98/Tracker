const BASE = import.meta.env.VITE_API_URL || '/api';

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${path} → ${res.status} ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function initDb() {
  // Probe the backend so the UI can show a banner if it's unreachable,
  // and surface whether URL extraction is wired up.
  try {
    const health = await request('GET', '/health');
    return {
      persistenceMode: health.persistenceMode,
      extractionAvailable: Boolean(health.extractionAvailable),
    };
  } catch (err) {
    console.error('Backend unreachable:', err);
    return { persistenceMode: 'offline', extractionAvailable: false };
  }
}

export const extractJob = (url) => request('POST', '/extract-job', { url });

export const listCompanies = () => request('GET', '/companies');
export const createCompany = (c) => request('POST', '/companies', c);
export const updateCompany = (id, patch) => request('PUT', `/companies/${id}`, patch);
export const deleteCompany = (id) => request('DELETE', `/companies/${id}`);
export const reorderCompanies = (orderedIds) =>
  request('POST', '/companies/reorder', { orderedIds });
export const getTweaks = () => request('GET', '/tweaks');
export const setTweaks = (patch) => request('PUT', '/tweaks', patch);
