// NL quick-log: parse free-text activity entry into structured payload,
// then commit to the DB (company upsert + event append).

const OPENROUTER_TIMEOUT_MS = 20_000;
const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-oss-20b:free';

const SYSTEM_PROMPT = `You parse job-search activity logs into structured JSON.

Return ONLY valid JSON with this exact shape (no prose, no markdown fences):
{
  "company": { "name": "string", "role": "string" },
  "contact": { "name": "string", "title": "string", "role_type": "hm|recruiter|referral|cold_reach|employee" },
  "message": { "direction": "outbound|inbound", "channel": "linkedin|email|phone|in_person|other", "body_summary": "string", "next_followup_days": null, "template_hint": "string" },
  "event": { "kind": "reached_out|applied|responded|scheduled|interviewed|advanced|offer_received|rejected|ghosted|withdrew|note" }
}

Rules:
- company.name / company.role: extract from text; role can be empty if not mentioned.
- contact: leave all empty strings if no specific person is named.
- message: set to null if no message/communication is described. next_followup_days must be a number or null.
- event.kind: pick the most relevant from the enum; default to "reached_out" for outbound contact, "note" when unsure.
- template_hint: name of a template if explicitly mentioned (e.g. "v2-intro"), otherwise empty string.`;

function stubParsed(text) {
  // Returns a plausible stub when no API key is configured — exercises the UI.
  return {
    company: { name: 'Acme Corp', role: '' },
    contact: { name: '', title: '', role_type: 'cold_reach' },
    message: {
      direction: 'outbound',
      channel: 'linkedin',
      body_summary: text.trim().slice(0, 120),
      next_followup_days: null,
      template_hint: '',
    },
    event: { kind: 'reached_out' },
  };
}

export async function parseNlLog(text) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return stubParsed(text);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);
  let res;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/bharat98/Tracker',
        'X-Title': 'Job Tracker NL Log',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text.trim() },
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
    throw Object.assign(
      new Error(`OpenRouter returned ${res.status}: ${body.slice(0, 200)}`),
      { status: 502 }
    );
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? '';

  if (!raw.trim()) {
    throw Object.assign(
      new Error('Model returned an empty response. Try rephrasing.'),
      { status: 502 }
    );
  }

  let cleaned = raw
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  let parsed = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { /* fall through */ }
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    throw Object.assign(new Error('Could not parse model response as JSON. Try rephrasing.'), { status: 502 });
  }

  // Normalise — guarantee the expected shape exists even if the model omitted fields.
  return {
    company: {
      name: String(parsed.company?.name || '').trim(),
      role:  String(parsed.company?.role  || '').trim(),
    },
    contact: {
      name:      String(parsed.contact?.name      || '').trim(),
      title:     String(parsed.contact?.title     || '').trim(),
      role_type: String(parsed.contact?.role_type || 'cold_reach'),
    },
    message: parsed.message
      ? {
          direction:         String(parsed.message.direction || 'outbound'),
          channel:           String(parsed.message.channel   || 'linkedin'),
          body_summary:      String(parsed.message.body_summary || '').trim(),
          next_followup_days: typeof parsed.message.next_followup_days === 'number'
            ? parsed.message.next_followup_days
            : null,
          template_hint: String(parsed.message.template_hint || '').trim(),
        }
      : null,
    event: {
      kind: String(parsed.event?.kind || 'note'),
    },
  };
}

// commitNlLog: upsert company + append event. Contact/message tables don't
// exist yet — those fields are preserved in the returned object so the
// frontend can display them, but they aren't persisted in this version.
export function commitNlLog(parsed, db) {
  const companyName = parsed?.company?.name?.trim();
  if (!companyName) {
    throw Object.assign(new Error('Company name is required to commit.'), { status: 400 });
  }

  // Try to find an existing company (case-insensitive name match).
  const all = db.listCompanies();
  const existing = all.find(
    (c) => c.name.toLowerCase() === companyName.toLowerCase()
  );

  let company;
  if (existing) {
    // Patch role if we extracted one and the existing company doesn't have one.
    const patch = {};
    if (parsed.company.role && !existing.role) patch.role = parsed.company.role;
    if (Object.keys(patch).length) db.updateCompany(existing.id, patch);
    company = { ...existing, ...patch };
  } else {
    company = db.createCompany({
      name: companyName,
      role: parsed.company.role || '',
    });
  }

  // Append an event for the company.
  const eventKind = parsed.event?.kind || 'note';
  const channel   = parsed.message?.channel || '';
  const notes     = parsed.message?.body_summary
    ? `[Quick Log] ${parsed.message.body_summary}`
    : '[Quick Log]';

  const event = db.createEvent({
    companyId: company.id,
    kind:      eventKind,
    actor:     'me',
    channel,
    notes,
    timestamp: Date.now(),
  });

  return { company, event };
}
