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
  const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp:free';

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
        response_format: { type: 'json_object' },
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
  // Models sometimes wrap JSON in markdown fences even when asked not to.
  const cleaned = raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      company: typeof parsed.company === 'string' ? parsed.company.trim() : '',
      role: typeof parsed.role === 'string' ? parsed.role.trim() : '',
    };
  } catch {
    throw Object.assign(new Error('LLM did not return valid JSON.'), { status: 502 });
  }
}

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
  const { company, role } = await callOpenRouter({ ...og, text, url: url.toString() });
  return { company, role, sourceUrl: url.toString() };
}
