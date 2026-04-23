// Server-side URL extraction: fetch a job posting URL, strip its HTML down
// to clean text, ask an LLM (via OpenRouter) for {company, role}.
//
// Security notes (basic-decent; full audit before exposing publicly):
// - URL validated for protocol and max length.
// - SSRF guard: hostnames that resolve to private / loopback / link-local
//   addresses are rejected. Best-effort via Node's dns.lookup — a
//   determined attacker could still race DNS, but this blocks the common
//   cases. Tighten before public deploy.
// - Response capped at MAX_BYTES; fetch aborted after FETCH_TIMEOUT_MS.
// - LLM input is plain text only, with scripts/styles stripped, to reduce
//   prompt-injection surface from crafted HTML.

import { lookup } from 'node:dns/promises';
import net from 'node:net';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 2_000_000; // 2 MB
const MAX_TEXT_CHARS = 8_000; // cap what goes to the LLM
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

const PRIVATE_IPV4_RANGES = [
  [10, 0, 0, 0, 8],          // 10.0.0.0/8
  [172, 16, 0, 0, 12],       // 172.16.0.0/12
  [192, 168, 0, 0, 16],      // 192.168.0.0/16
  [127, 0, 0, 0, 8],         // 127.0.0.0/8 (loopback)
  [169, 254, 0, 0, 16],      // 169.254.0.0/16 (link-local)
  [0, 0, 0, 0, 8],           // 0.0.0.0/8
  [100, 64, 0, 0, 10],       // 100.64.0.0/10 (CGNAT)
];

const ipv4InRange = (ip, [a, b, c, d, mask]) => {
  const bits = (o) => o.map((x) => x.toString(2).padStart(8, '0')).join('').slice(0, mask);
  return bits(ip) === bits([a, b, c, d]);
};

const isPrivateAddress = (addr, family) => {
  if (family === 4) {
    const parts = addr.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    return PRIVATE_IPV4_RANGES.some((r) => ipv4InRange(parts, r));
  }
  // IPv6 — err on the side of caution and block loopback + link-local + unique-local
  const lower = addr.toLowerCase();
  return (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fe80:') ||
    lower.startsWith('fc') ||
    lower.startsWith('fd')
  );
};

async function validateUrl(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) {
    throw Object.assign(new Error('URL is required (≤ 2048 chars).'), { status: 400 });
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw Object.assign(new Error('Malformed URL.'), { status: 400 });
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw Object.assign(new Error('Only http(s) URLs are allowed.'), { status: 400 });
  }

  // If hostname is a literal IP, check directly; otherwise resolve via DNS.
  const hostIsLiteralIp = net.isIP(url.hostname);
  if (hostIsLiteralIp) {
    if (isPrivateAddress(url.hostname, hostIsLiteralIp)) {
      throw Object.assign(new Error('Destination is a private/internal address.'), { status: 400 });
    }
  } else {
    try {
      const { address, family } = await lookup(url.hostname);
      if (isPrivateAddress(address, family)) {
        throw Object.assign(new Error('Destination is a private/internal address.'), { status: 400 });
      }
    } catch (err) {
      if (err.status) throw err;
      throw Object.assign(new Error('Could not resolve destination hostname.'), { status: 400 });
    }
  }
  return url;
}

async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; JobTrackerBot/1.0; +https://github.com/bharat98/Tracker)',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    if (!res.ok) {
      throw Object.assign(new Error(`Target returned HTTP ${res.status}.`), { status: 502 });
    }

    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        controller.abort();
        throw Object.assign(new Error('Target response too large.'), { status: 413 });
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } catch (err) {
    if (err.name === 'AbortError') {
      throw Object.assign(new Error('Fetch timed out.'), { status: 504 });
    }
    if (err.status) throw err;
    throw Object.assign(new Error('Fetch failed: ' + err.message), { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}

function extractOgTags(html) {
  const pick = (prop) => {
    const match =
      html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i')) ||
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, 'i'));
    return match?.[1]?.trim() || '';
  };
  return {
    ogTitle: pick('og:title'),
    ogDescription: pick('og:description'),
    ogSiteName: pick('og:site_name'),
  };
}

// Fast-path: try to extract company + role from OG tags alone, no LLM needed.
// Handles the most common patterns across LinkedIn, Greenhouse, Lever, direct
// career pages (e.g. "Software Engineer at Google | LinkedIn",
// "Customer Onboarding Manager III | ZoomInfo", "TAM - Salesforce").
function parseFromOgTags({ ogTitle, ogSiteName }) {
  if (!ogTitle) return null;

  let role = '';
  let company = '';

  // Pattern: "Role at Company" or "Role at Company | Site"
  const atMatch = ogTitle.match(/^(.+?)\s+at\s+([^|]+?)(?:\s*\|.*)?$/i);
  if (atMatch) {
    role = atMatch[1].trim();
    company = atMatch[2].trim();
    if (role && company) return { role, company };
  }

  // Pattern: "Role | Company" or "Role - Company"
  const sepMatch = ogTitle.match(/^(.+?)\s*[|\-–—]\s*(.+)$/);
  if (sepMatch) {
    const left = sepMatch[1].trim();
    const right = sepMatch[2].trim();
    // If og:site_name matches one side, the other side is likely the role
    if (ogSiteName) {
      const siteNorm = ogSiteName.toLowerCase();
      if (right.toLowerCase().includes(siteNorm) || siteNorm.includes(right.toLowerCase())) {
        // right is the site name — left is "Role" and site is the company
        return { role: left, company: ogSiteName };
      }
      if (left.toLowerCase().includes(siteNorm) || siteNorm.includes(left.toLowerCase())) {
        return { role: right, company: ogSiteName };
      }
    }
    // No site match — treat left as role, right as company (most common)
    return { role: left, company: right };
  }

  // Title is just a plain string — use it as role; company from ogSiteName if present
  if (ogSiteName) return { role: ogTitle, company: ogSiteName };

  return null;
}

function htmlToText(html) {
  // Remove scripts, styles, head (prompt-injection hygiene), then collapse tags.
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function callOpenRouter({ ogTitle, ogDescription, ogSiteName, text, url }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw Object.assign(
      new Error(
        'URL extraction is not configured. Set OPENROUTER_API_KEY in server/.env to enable it.'
      ),
      { status: 503 }
    );
  }
  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-oss-20b:free';

  const system =
    'You extract structured metadata from job postings. ' +
    'Respond with ONLY a JSON object of the form {"company": "...", "role": "..."}. ' +
    'Use empty string if a field is unknown. No prose, no markdown, no code fences.';

  const userMessage = [
    `Source URL: ${url}`,
    ogSiteName ? `OG site name: ${ogSiteName}` : '',
    ogTitle ? `OG title: ${ogTitle}` : '',
    ogDescription ? `OG description: ${ogDescription}` : '',
    '',
    'Page text (truncated):',
    text.slice(0, MAX_TEXT_CHARS),
  ]
    .filter(Boolean)
    .join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/bharat98/Tracker',
        'X-Title': 'Job Tracker',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        // NOTE: not passing response_format — many free-tier models (MiniMax,
        // some Gemma variants) silently return empty completions when it's
        // set. Prompt-only JSON is more portable across providers.
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMessage },
        ],
      }),
    });
  } catch (err) {
    throw Object.assign(new Error('OpenRouter request failed: ' + err.message), { status: 502 });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw Object.assign(new Error(`OpenRouter returned ${res.status}: ${body.slice(0, 200)}`), {
      status: 502,
    });
  }
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? '';
  const finishReason = data?.choices?.[0]?.finish_reason;

  // Some free-tier models (MiniMax-m2.5, rate-limited Gemma) return 200 OK
  // with completely empty content. Surface a specific error so users know
  // to swap models, rather than the generic "invalid JSON".
  if (!raw.trim()) {
    console.error('[extract] empty completion from model', {
      model,
      finishReason,
      usage: data?.usage,
    });
    throw Object.assign(
      new Error(
        `Model "${model}" returned an empty response. Try switching OPENROUTER_MODEL to openai/gpt-oss-20b:free or inclusionai/ling-2.6-flash:free.`
      ),
      { status: 502 }
    );
  }

  // Strip common wrappers: markdown fences, <think> tags from reasoning models.
  let cleaned = raw
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  // First try direct parse.
  let parsed = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Fallback: find the first { ... } block anywhere in the output.
    const match = cleaned.match(/\{[\s\S]*?\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        /* fall through */
      }
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    console.error('[extract] LLM did not return parseable JSON', {
      finishReason,
      usage: data?.usage,
      rawFirst500: raw.slice(0, 500),
    });
    const detail =
      finishReason === 'length'
        ? 'The model ran out of tokens before emitting JSON (likely too much "thinking"). Try a non-reasoning model like google/gemini-2.0-flash-exp:free.'
        : 'LLM did not return valid JSON.';
    throw Object.assign(new Error(detail), { status: 502 });
  }

  return {
    company: typeof parsed.company === 'string' ? parsed.company.trim() : '',
    role: typeof parsed.role === 'string' ? parsed.role.trim() : '',
  };
}

// sourceText is capped at 100 KB — plenty for any realistic JD, keeps
// the HTTP response to the client reasonable.
const MAX_SOURCE_TEXT = 100_000;

export async function extractJob(rawUrl) {
  // Fail fast if extraction isn't configured — avoids a wasted outbound fetch.
  if (!process.env.OPENROUTER_API_KEY) {
    throw Object.assign(
      new Error(
        'URL extraction is not configured. Set OPENROUTER_API_KEY in server/.env to enable it.'
      ),
      { status: 503 }
    );
  }
  const url = await validateUrl(rawUrl);
  const html = await fetchPage(url);
  const og = extractOgTags(html);
  const text = htmlToText(html);

  // Fast-path: if OG tags already give us both fields, skip the LLM entirely.
  const fromOg = parseFromOgTags(og);
  if (fromOg?.company && fromOg?.role) {
    console.log('[extract] OG fast-path hit — skipping LLM');
    return {
      company: fromOg.company,
      role: fromOg.role,
      sourceUrl: url.toString(),
      sourceText: text.slice(0, MAX_SOURCE_TEXT),
    };
  }

  const { company, role } = await callOpenRouter({ ...og, text, url: url.toString() });
  return {
    company,
    role,
    sourceUrl: url.toString(),
    sourceText: text.slice(0, MAX_SOURCE_TEXT),
  };
}
