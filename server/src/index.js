import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { routes } from './routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/api', routes);

// In production (Docker / Cloud Run), the client build is copied to
// server/public — serve it from the same origin so /api works without CORS
// and without a separate frontend host.
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
});
