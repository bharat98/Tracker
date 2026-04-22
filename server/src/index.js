import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { routes } from './routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const app = express();

// Security headers. contentSecurityPolicy is tuned so the built client
// (which uses inline styles) still works when served from /public.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'img-src': ["'self'", 'data:'],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'script-src': ["'self'"],
        'connect-src': ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false, // not needed and blocks Google Fonts
  })
);

// CORS: permissive in dev so the Vite dev server on :5173 can hit the API.
// Tighten to a specific origin list before public deploy.
app.use(cors());

// Global rate limit — coarse backstop; extract-job has its own tighter limit.
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  })
);

app.use(express.json({ limit: '2mb' }));
app.use('/api', routes);

// In production the client build is copied to server/public — serve it from
// the same origin so /api works without CORS and no separate frontend host.
const clientDir = path.resolve(__dirname, '../public');
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDir, 'index.html'));
  });
  console.log(`Serving client from ${clientDir}`);
}

app.listen(PORT, () => {
  console.log(`tracker server listening on :${PORT}`);
  if (!process.env.OPENROUTER_API_KEY) {
    console.log('  (URL extraction disabled — no OPENROUTER_API_KEY in env)');
  }
});
