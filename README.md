# Job Tracker

React + Express + SQLite. Tracks job applications across companies — statuses, next steps, blockers, notes. Designed to later expose an MCP server so Claude/Gemini CLIs can read and modify the tracker.

## Layout

```
client/   Vite + React frontend
server/   Express + better-sqlite3 backend
Dockerfile, docker-compose.yml   for GCP / VM deploys
deploy/gcp.md                    how to host on Google Cloud
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

## Host it

See [`deploy/gcp.md`](./deploy/gcp.md) for Google Cloud deployment — a free-tier VM path and a Cloud Run path.


 To switch back to the IndexedDB version:
  git checkout main
  rm -rf node_modules package-lock.json   # clean slate since package.json
  differs
  npm install
  npm run dev
  # open http://localhost:5173

  To come back to the split version:
  git checkout split-frontend-backend
  npm run install-all   # only needed first time per branch
  npm run dev
