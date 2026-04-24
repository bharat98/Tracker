// LinkedIn profile lookup — best-effort scrape of the *public* page.
//
// We hit the URL server-side with a browser User-Agent and parse the
// HTML for whatever the public view exposes: name from og:title / <title>,
// headline from og:description or the title suffix. LinkedIn aggressively
// auth-walls non-public profiles; we detect that and return 422 so the
// UI can fall back to manual entry.
//
// No credentials, no cookies, no third-party API — which means this is
// inherently best-effort. LinkedIn can block the IP, change markup, or
// A/B-test the auth wall at any time. Keep expectations calibrated.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/120.0.0.0 Safari/537.36';

const LINKEDIN_URL_RE = /^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[^/?#]+/i;
const REQUEST_TIMEOUT_MS = 12_000;

export function isLinkedInProfileUrl(url) {
  return LINKEDIN_URL_RE.test(String(url || '').trim());
}

// Normalize smart quotes / encoded entities in the title string so downstream
// splitting works consistently.
function decodeEntities(s) {
  if (!s) return '';
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function metaContent(html, property) {
  // property= or name=; content before or after
  const re1 = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    'i'
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    'i'
  );
  return (html.match(re1) || html.match(re2) || [])[1] || '';
}

function getTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim() : '';
}

// Strip " | LinkedIn" / " | Professional Profile" / trailing site suffixes.
function stripLinkedInSuffix(s) {
  return s
    .replace(/\s*[|•·]\s*LinkedIn.*$/i, '')
    .replace(/\s*[|•·]\s*Professional Profile.*$/i, '')
    .trim();
}

// Split name/headline on " - " or " – " or " — ". LinkedIn typically serves
// "First Last - Headline - Current Company" but format varies.
function splitNameHeadline(s) {
  const parts = s.split(/\s+[-–—]\s+/);
  const name = (parts[0] || '').trim();
  const headline = parts.slice(1).join(' – ').trim();
  return { name, headline };
}

function splitFirstLast(name) {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) return { firstName: '', lastName: '' };
  const bits = trimmed.split(' ');
  if (bits.length === 1) return { firstName: bits[0], lastName: '' };
  return {
    firstName: bits[0],
    lastName: bits.slice(1).join(' '),
  };
}

// True if the response looks like the auth wall / login page rather than
// a public profile.
function looksLikeAuthWall(finalUrl, html) {
  if (/\/authwall/i.test(finalUrl)) return true;
  if (/\/login/i.test(finalUrl) || /\/uas\/login/i.test(finalUrl)) return true;
  if (/Join LinkedIn to see/i.test(html) && !/og:title/i.test(html)) return true;
  return false;
}

/**
 * Fetch and parse a public LinkedIn profile.
 *
 * @param {string} url
 * @returns {Promise<{ firstName: string, lastName: string, headline: string, source: 'og'|'title'|'' }>}
 * @throws { status: 400 | 422 | 502 | 504 }
 */
export async function fetchLinkedInProfile(url) {
  const trimmed = String(url || '').trim();
  if (!isLinkedInProfileUrl(trimmed)) {
    throw Object.assign(new Error('URL must be a linkedin.com/in/… profile.'), { status: 400 });
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(trimmed, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw Object.assign(new Error('LinkedIn request timed out.'), { status: 504 });
    }
    throw Object.assign(new Error(`Network error reaching LinkedIn: ${err.message}`), {
      status: 502,
    });
  } finally {
    clearTimeout(t);
  }

  const finalUrl = res.url || trimmed;
  const html = await res.text().catch(() => '');

  if (!res.ok && res.status !== 999) {
    throw Object.assign(new Error(`LinkedIn returned ${res.status}.`), { status: 502 });
  }

  if (looksLikeAuthWall(finalUrl, html)) {
    throw Object.assign(
      new Error('LinkedIn served an auth wall. Profile may be private, or the IP is rate-limited.'),
      { status: 422 }
    );
  }

  // Prefer og:title / og:description when present (cleaner than <title>)
  const ogTitle = decodeEntities(metaContent(html, 'og:title'));
  const ogDesc  = decodeEntities(metaContent(html, 'og:description'));
  const titleTag = decodeEntities(getTitle(html));

  // Name source: og:title is usually "First Last" without the suffix noise —
  // but sometimes LinkedIn packs the headline and "| LinkedIn" in there too,
  // so we always run it through the suffix stripper.
  const primary = stripLinkedInSuffix(ogTitle || titleTag);
  const { name: nameFromPrimary, headline: headlineFromPrimary } = splitNameHeadline(primary);

  // og:title may *already* be just the name with no headline — in that case,
  // we mine the <title> tag for the headline portion.
  let headline = headlineFromPrimary;
  if (!headline && titleTag) {
    const { headline: h2 } = splitNameHeadline(stripLinkedInSuffix(titleTag));
    headline = h2;
  }
  // Some profiles put the headline only in og:description.
  if (!headline && ogDesc) {
    // og:description often starts with the headline, then " · Experience: …".
    // Cut at " · " or " View …'s profile".
    headline = ogDesc.split(/\s+[·•]\s+/)[0]
      .replace(/\s+View\s+[^']+'s\s+profile.*$/i, '')
      .trim();
  }

  const { firstName, lastName } = splitFirstLast(nameFromPrimary);

  if (!firstName && !lastName && !headline) {
    throw Object.assign(
      new Error('Could not parse name or headline from the page. LinkedIn may have changed markup.'),
      { status: 422 }
    );
  }

  return {
    firstName,
    lastName,
    headline,
    source: ogTitle ? 'og' : 'title',
  };
}
