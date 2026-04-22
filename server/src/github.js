// GitHub sync: creates one folder per job (Company-Role_With_Underscores)
// in a configured repo. One folder = README.md (metadata) + description.md
// (the raw JD text from the URL extraction).
//
// All traffic uses the REST Contents API — no git CLI, no cloning, just
// authenticated HTTPS. The PAT lives in GITHUB_TOKEN; if it's missing the
// sync is disabled and callers get a 503 they can degrade around.

const GITHUB_API = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const REQUEST_TIMEOUT_MS = 15_000;

// --- slug / folder naming ---
// Rule: spaces inside a field → underscores; strip everything that's not
// alphanumeric (except spaces, which become underscores). Company and role
// are joined with a single dash. Dashes are never used within a field.
export function slug(s) {
  return String(s || '')
    .trim()
    .replace(/[^a-zA-Z0-9 ]+/g, '')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function folderName(company, role, suffix = 0) {
  const c = slug(company);
  const r = slug(role);
  if (!c || !r) return null;
  const base = `${c}-${r}`;
  return suffix > 1 ? `${base}-${suffix}` : base;
}

// --- configuration ---
function getConfig() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!token || !repo) {
    return {
      configured: false,
      reason: !token
        ? 'GitHub sync not configured: GITHUB_TOKEN is empty in server/.env.'
        : 'GitHub sync not configured: GITHUB_REPO is empty in server/.env.',
    };
  }
  if (!/^[^/]+\/[^/]+$/.test(repo)) {
    return { configured: false, reason: 'GITHUB_REPO must be in "owner/repo" format.' };
  }
  return { configured: true, token, repo, branch };
}

// --- low-level API ---
async function gh(method, path, { token, body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(GITHUB_API + path, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': API_VERSION,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } finally {
    clearTimeout(timer);
  }
  return res;
}

// Encodes a UTF-8 string to base64 — GitHub wants file content base64-encoded.
const toBase64 = (s) => Buffer.from(s, 'utf8').toString('base64');

// Returns true if a path exists in the configured repo, false if 404.
// Other statuses (auth errors, rate limit, etc.) throw.
async function pathExists(path) {
  const { token, repo, branch } = getConfig();
  const res = await gh(
    'GET',
    `/repos/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`,
    { token }
  );
  if (res.status === 404) return false;
  if (res.ok) return true;
  const body = await res.text().catch(() => '');
  throw Object.assign(
    new Error(`GitHub ${res.status} on existence check for "${path}": ${body.slice(0, 200)}`),
    { status: res.status === 401 ? 401 : 502 }
  );
}

async function putFile(path, content, message) {
  const { token, repo, branch } = getConfig();
  const res = await gh('PUT', `/repos/${repo}/contents/${encodeURI(path)}`, {
    token,
    body: { message, content: toBase64(content), branch },
  });
  if (res.ok) return res.json();
  const body = await res.text().catch(() => '');
  // 422 = file already exists (without sha) — our caller should handle via
  // existence check first, but surface it cleanly just in case.
  throw Object.assign(
    new Error(`GitHub ${res.status} writing "${path}": ${body.slice(0, 200)}`),
    { status: res.status === 401 ? 401 : res.status === 422 ? 409 : 502 }
  );
}

// --- high-level ---
function buildReadme({ company, role, sourceUrl, trackerId, createdAt }) {
  const dateStr = new Date(createdAt).toISOString().slice(0, 10);
  return [
    `# ${company} — ${role}`,
    '',
    `- **Added:** ${dateStr}`,
    sourceUrl ? `- **Source:** ${sourceUrl}` : null,
    `- **Tracker ID:** \`${trackerId}\``,
    '',
  ]
    .filter((line) => line !== null)
    .join('\n');
}

function buildDescription({ company, role, sourceUrl, sourceText }) {
  const head = [
    `# ${company} — ${role}`,
    '',
    sourceUrl ? `Source: ${sourceUrl}` : null,
    `Extracted: ${new Date().toISOString().slice(0, 10)}`,
    '',
    '---',
    '',
  ]
    .filter((line) => line !== null)
    .join('\n');
  return head + (sourceText || '').trim() + '\n';
}

/**
 * Sync a company to GitHub.
 *
 * @param {object} args
 * @param {object} args.company   — { id, name, role, created_at }
 * @param {string} [args.sourceUrl]
 * @param {string} [args.sourceText]
 * @param {boolean} [args.force]  — if true, auto-suffix (-2, -3, …) on conflict
 * @returns {Promise<{status: 'created'|'conflict'|'skipped', folderPath?, folderName?}>}
 */
export async function syncCompany({ company, sourceUrl, sourceText, force = false }) {
  const cfg = getConfig();
  if (!cfg.configured) {
    throw Object.assign(new Error(cfg.reason), { status: 503 });
  }

  const base = folderName(company.name, company.role);
  if (!base) {
    return { status: 'skipped', reason: 'Missing company name or role.' };
  }

  // Find a free folder name. If force=false and the base collides, return
  // a conflict so the UI can ask the user what to do. If force=true, keep
  // trying -2, -3, ... up to -99.
  let chosen = base;
  if (await pathExists(base)) {
    if (!force) {
      return { status: 'conflict', folderName: base };
    }
    let i = 2;
    while (i < 100 && (await pathExists(folderName(company.name, company.role, i)))) {
      i += 1;
    }
    if (i >= 100) {
      throw Object.assign(new Error('Too many conflicting folders (100+). Give up.'), {
        status: 500,
      });
    }
    chosen = folderName(company.name, company.role, i);
  }

  const commitMsg = `Add ${company.name} — ${company.role}`;
  const readme = buildReadme({
    company: company.name,
    role: company.role,
    sourceUrl,
    trackerId: company.id,
    createdAt: company.created_at || Date.now(),
  });
  const description = buildDescription({
    company: company.name,
    role: company.role,
    sourceUrl,
    sourceText,
  });

  // README first — that's the one that logically "creates" the folder.
  // description.md is best-effort; if it fails the folder still exists with
  // the metadata, and the user can re-sync.
  await putFile(`${chosen}/README.md`, readme, commitMsg);
  try {
    await putFile(`${chosen}/description.md`, description, commitMsg);
  } catch (err) {
    console.error('[github] description.md write failed (README succeeded):', err.message);
  }

  return { status: 'created', folderPath: chosen };
}

export function isConfigured() {
  return getConfig().configured;
}
