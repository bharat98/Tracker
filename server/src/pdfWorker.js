// Background worker for async JD-page-to-PDF capture.
//
// /github/sync writes README.md + description.md and enqueues a pdf_jobs row;
// this worker polls SQLite, launches Playwright/Chromium, prints the source
// URL to PDF, and uploads it as jd.pdf in the company's GitHub folder.
//
// Mirrors the pattern in extractor.js (poll + kick + FIFO + per-tick cap).

import * as db from './db.js';
import { uploadJdPdf } from './github.js';

const POLL_MS = 5_000;
const MAX_PER_TICK = 1;          // PDF capture is heavy; one at a time.
const MAX_ATTEMPTS = 3;
const NAV_TIMEOUT_MS = 30_000;
const RENDER_SETTLE_MS = 1_500;  // post-load grace for late-loading content.

let running = false;
let kickPending = false;
let browserPromise = null;

// Lazy-import Playwright so installs without the browser don't crash boot —
// the worker only needs chromium when there's actually a job to process.
async function getBrowser() {
  if (browserPromise) return browserPromise;
  browserPromise = (async () => {
    const { chromium } = await import('playwright');
    return chromium.launch({ headless: true });
  })().catch((err) => {
    browserPromise = null;
    throw err;
  });
  return browserPromise;
}

export function kickPdfWorker() {
  if (running) { kickPending = true; return; }
  scan();
}

async function scan() {
  if (running) { kickPending = true; return; }
  running = true;
  kickPending = false;
  try {
    const pending = db.listPendingPdfJobs(MAX_PER_TICK);
    for (const job of pending) {
      try {
        await processJob(job);
      } catch (err) {
        const attempts = (job.attempts || 0) + 1;
        const failed = attempts >= MAX_ATTEMPTS;
        console.error(`[pdf] job ${job.id} attempt ${attempts} failed:`, err.message);
        try {
          db.updatePdfJob(job.id, {
            status:   failed ? 'failed' : 'pending',
            error:    String(err.message || 'Unknown error').slice(0, 500),
            attempts,
          });
        } catch (writeErr) {
          console.error(`[pdf] could not update job ${job.id}:`, writeErr.message);
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

async function processJob(job) {
  if (!job.sourceUrl) {
    db.updatePdfJob(job.id, { status: 'failed', error: 'No source URL' });
    return;
  }

  const buffer = await renderPagePdf(job.sourceUrl);

  const company = db.getCompany(job.companyId);
  const label = company ? `${company.name} — ${company.role}` : job.folderPath;
  await uploadJdPdf({
    folderPath: job.folderPath,
    buffer,
    message: `Add JD PDF: ${label}`,
  });

  db.updatePdfJob(job.id, { status: 'done', error: '', attempts: (job.attempts || 0) + 1 });
}

async function renderPagePdf(url) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1800 },
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS });
    await page.waitForTimeout(RENDER_SETTLE_MS);
    // Force print media — many sites have polished print stylesheets that hide
    // navigation/footer chrome. Fall back to screen if print is broken.
    await page.emulateMedia({ media: 'print' }).catch(() => {});
    return await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.4in', bottom: '0.4in', left: '0.4in', right: '0.4in' },
    });
  } finally {
    await context.close().catch(() => {});
  }
}

export function startPdfWorker() {
  // Pick up anything left pending from a previous run.
  scan().catch((err) => console.error('[pdf] initial scan failed:', err));
  setInterval(() => {
    scan().catch((err) => console.error('[pdf] poll failed:', err));
  }, POLL_MS);
  console.log(`[pdf] worker started (poll ${POLL_MS}ms)`);
}
