// Per-company timeline entry parser. Unlike nllog (the global Quick Log), the
// company is already known here — we don't have to extract it. The LLM's job is
// to turn "found Sarah Chen on LinkedIn, [post URL]" into:
//   - one event row (kind, channel, summary)
//   - one optional contact upsert (firstName, lastName, role_type, source_url)
//   - one optional stage_change

const TIMEOUT_MS = 20_000;
const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-oss-20b:free';

const STAGES = ['sourced', 'networked', 'applied', 'screen', 'interview', 'final', 'offer', 'closed'];
const EVENT_KINDS = [
  'reached_out', 'applied', 'hm_contacted', 'responded', 'scheduled',
  'interviewed', 'advanced', 'offer_received', 'offer_accepted',
  'rejected', 'ghosted', 'withdrew', 'note',
];

const SYSTEM_PROMPT = `You parse a single job-search activity entry into structured JSON. The company is already known — do NOT extract it.

Return ONLY valid JSON (no prose, no markdown fences) with this exact shape:
{
  "event": {
    "kind": "${EVENT_KINDS.join('|')}",
    "channel": "linkedin|email|phone|in_person|portal|recruiter|referral|other",
    "actor": "me|them",
    "summary": "string"
  },
  "contact": null | {
    "first_name": "string",
    "last_name": "string",
    "title": "string",
    "role_type": "hm|recruiter|referral|other",
    "linkedin_url": "string",
    "email": "string",
    "source_url": "string"
  },
  "stage_change": null | "${STAGES.join('|')}"
}

Rules:
- event.summary: a one-sentence factual summary of what the user did.
- event.actor: "me" if the user did the action, "them" if the company/person did.
- event.kind: pick the closest match; default to "note" when unsure.
- contact: include only when the entry names a specific person involved. role_type "hm" = hiring manager.
- contact.source_url: if the entry includes a URL that proves how the user found this person (a LinkedIn post, a tweet, a profile), put it here.
- stage_change: only if the entry clearly implies a stage transition (e.g. "applied today" → "applied"; "got a screen call" → "screen"). null otherwise.`;

function stubResult(text) {
  return {
    event: { kind: 'note', channel: '', actor: 'me', summary: text.trim().slice(0, 200) },
    contact: null,
    stage_change: null,
  };
}

export async function parseTimelineEntry({ text, url, hasImage, company }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return stubResult(text);

  const userMessage = [
    `Company: ${company.name}`,
    company.role ? `Role: ${company.role}` : '',
    company.currentStage ? `Current stage: ${company.currentStage}` : '',
    url ? `URL the user pasted with this entry: ${url}` : '',
    hasImage ? 'The user also attached a screenshot to this entry.' : '',
    '',
    'Entry text:',
    text.trim(),
  ].filter(Boolean).join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/bharat98/Tracker',
        'X-Title': 'Job Tracker Timeline',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
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
    throw Object.assign(new Error(`OpenRouter returned ${res.status}: ${body.slice(0, 200)}`), { status: 502 });
  }

  const data = await res.json();
  const raw  = data?.choices?.[0]?.message?.content ?? '';
  if (!raw.trim()) {
    // Fall back to a "note" event so the user's input isn't lost — better than throwing.
    return stubResult(text);
  }

  const cleaned = raw
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  let parsed = null;
  try { parsed = JSON.parse(cleaned); }
  catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) { try { parsed = JSON.parse(match[0]); } catch { /* */ } }
  }
  if (!parsed) return stubResult(text);

  // Normalise.
  const ev = parsed.event || {};
  const c  = parsed.contact;
  return {
    event: {
      kind:    EVENT_KINDS.includes(ev.kind) ? ev.kind : 'note',
      channel: String(ev.channel || ''),
      actor:   ev.actor === 'them' ? 'them' : 'me',
      summary: String(ev.summary || text.trim()).slice(0, 500),
    },
    contact: c && (c.first_name || c.last_name || c.linkedin_url || c.email)
      ? {
          first_name:   String(c.first_name   || '').trim(),
          last_name:    String(c.last_name    || '').trim(),
          title:        String(c.title        || '').trim(),
          role_type:    ['hm', 'recruiter', 'referral', 'other'].includes(c.role_type) ? c.role_type : 'other',
          linkedin_url: String(c.linkedin_url || '').trim(),
          email:        String(c.email        || '').trim(),
          source_url:   String(c.source_url   || url || '').trim(),
        }
      : null,
    stage_change: STAGES.includes(parsed.stage_change) ? parsed.stage_change : null,
  };
}
