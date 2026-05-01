// Background worker for async timeline-event enrichment.
//
// The /timeline POST persists an event with processing_status='pending' and
// returns immediately. This worker polls SQLite every POLL_MS, picks pending
// rows in FIFO order, calls the LLM (text-only by default, vision-enabled when
// OPENROUTER_VISION_MODEL is set and the event has an image attachment), then
// patches the row in place. UI polls a finished status to refresh.

import fs from 'node:fs';
import path from 'node:path';
import * as db from './db.js';
import { parseTimelineEntry } from './timeline.js';
import { syncFlatContactCols } from './routes.js';

const POLL_MS = 1500;
const MAX_PER_TICK = 3;

let running = false;
let kickPending = false;

export function kickWorker() {
  // Lets a fresh /timeline POST trigger an immediate scan instead of waiting
  // for the next poll tick. Single-event latency drops from ~750ms avg to ~0.
  if (running) { kickPending = true; return; }
  scan();
}

async function scan() {
  if (running) { kickPending = true; return; }
  running = true;
  kickPending = false;
  try {
    const pending = db.listPendingEvents(MAX_PER_TICK);
    for (const ev of pending) {
      try {
        await processEvent(ev);
      } catch (err) {
        console.error(`[extractor] event ${ev.id} failed:`, err.message);
        try {
          db.updateEvent(ev.id, {
            processingStatus: 'failed',
            processingError:  String(err.message || 'Unknown error').slice(0, 500),
          });
        } catch (writeErr) {
          console.error(`[extractor] could not mark event ${ev.id} failed:`, writeErr.message);
        }
      }
    }
  } finally {
    running = false;
    if (kickPending) {
      kickPending = false;
      setImmediate(scan);
    }
  }
}

async function processEvent(ev) {
  const company = db.getCompany(ev.companyId);
  if (!company) {
    db.updateEvent(ev.id, { processingStatus: 'failed', processingError: 'Company gone' });
    return;
  }

  const attachments = db.listAttachmentsByEvent(ev.id);
  const imageAttachment = attachments.find((a) => a.kind === 'image' && a.mimetype?.startsWith('image/'));

  const url       = ev.details?.url || '';
  const rawText   = ev.rawText || ev.notes || '';
  const promptText = rawText || (url ? `Logged a URL: ${url}` : 'Attached a screenshot.');

  // Read the image bytes only when we actually have a vision model — avoids
  // wasted IO on every text-only entry.
  let imageDataUri = null;
  if (imageAttachment && process.env.OPENROUTER_VISION_MODEL) {
    try {
      const abs = path.join(db.UPLOADS_DIR, imageAttachment.path);
      const buf = fs.readFileSync(abs);
      imageDataUri = `data:${imageAttachment.mimetype};base64,${buf.toString('base64')}`;
    } catch (err) {
      console.warn(`[extractor] could not read attachment for event ${ev.id}:`, err.message);
    }
  }

  const parsed = await parseTimelineEntry({
    text:     promptText,
    url,
    hasImage: !!imageAttachment,
    imageDataUri,
    company,
  });

  // Patch the event with the parsed kind/actor/channel/summary.
  const details = { ...(ev.details || {}) };
  if (parsed.event.summary && parsed.event.summary !== rawText) {
    details.summary = parsed.event.summary;
  }
  db.updateEvent(ev.id, {
    kind:             parsed.event.kind,
    actor:            parsed.event.actor,
    channel:          parsed.event.channel,
    details,
    notes:            rawText || parsed.event.summary,
    processingStatus: 'done',
    processingError:  '',
  });

  // Upsert contact + auto-flip established (mirrors what the synchronous path
  // used to do inline before this refactor).
  if (parsed.contact) {
    const c = parsed.contact;
    const result = db.upsertContact({
      companyId:   ev.companyId,
      firstName:   c.first_name,
      lastName:    c.last_name,
      title:       c.title,
      role:        c.role_type,
      linkedinUrl: c.linkedin_url,
      email:       c.email,
      sourceUrl:   c.source_url || url,
    });

    const isInboundResponse = parsed.event.actor === 'them' && parsed.event.kind === 'responded';
    const isOutreachRole    = c.role_type === 'hm' || c.role_type === 'hiring_manager' || c.role_type === 'recruiter';
    if (isInboundResponse && isOutreachRole && !result.contact.established) {
      db.updateContact(result.contact.id, { established: true });
    }
    syncFlatContactCols(ev.companyId);
  }

  if (parsed.stage_change && parsed.stage_change !== company.currentStage) {
    db.updateCompany(ev.companyId, { currentStage: parsed.stage_change });
  }
}

export function startWorker() {
  // On boot, any rows still pending from a previous run get picked up.
  scan().catch((err) => console.error('[extractor] initial scan failed:', err));
  setInterval(() => {
    scan().catch((err) => console.error('[extractor] poll failed:', err));
  }, POLL_MS);
  console.log(`[extractor] worker started (poll ${POLL_MS}ms, vision=${process.env.OPENROUTER_VISION_MODEL ? 'on' : 'off'})`);
}
