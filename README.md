# Job Tracker

React + Express + SQLite. Tracks job applications across companies — statuses, next steps, blockers, notes. Designed to later expose an MCP server so Claude/Gemini CLIs can read and modify the tracker.

## Layout

```
client/   Vite + React frontend
server/   Express + better-sqlite3 backend
```

## Run locally

```bash
npm run install-all   # installs root + client + server
npm run dev           # client :5173, server :3000
# open http://localhost:5173
```

Or production-style (one port, server serves built client):

```bash
npm run build
npm start
# open http://localhost:3000
```

## Optional: job-URL extraction

Paste a job posting URL when adding a new company and the server will try to auto-fill the company and role using an LLM via OpenRouter.

To enable it, copy `server/.env.example` → `server/.env` and fill in `OPENROUTER_API_KEY`. Without the key the "Fetch" button stays disabled and the modal works as before (type name and role manually).

## Branches

- `main` — browser-only IndexedDB build (simplest, no backend)
- `split-frontend-backend` — this branch, Express + SQLite backend with URL extraction
- `deployment-gcp` — adds Dockerfile and Google Cloud deploy instructions on top

### Switching between branches

```bash
# Go back to the IndexedDB-only version
git checkout main
rm -rf node_modules package-lock.json   # clean slate since package.json differs
npm install
npm run dev
# open http://localhost:5173

# Come back to the split version
git checkout split-frontend-backend
npm run install-all   # only needed first time per branch
npm run dev
```
