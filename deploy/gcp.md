# Deploying to Google Cloud

Two paths, pick based on how hands-off you want it. Both work inside the $200 / 3-month free trial *and* afterwards using GCP's always-free tier.

---

## Path A — Compute Engine VM (simplest, free forever in most regions)

A single `e2-micro` VM in `us-central1` / `us-east1` / `us-west1` is in GCP's **always-free** tier. SQLite lives on the VM's disk. One machine, one DB, no quirks.

```bash
# 1. Create the VM (choose a free-tier region)
gcloud compute instances create tracker \
  --zone=us-central1-a \
  --machine-type=e2-micro \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --tags=http-server

# 2. Allow HTTP in
gcloud compute firewall-rules create allow-http \
  --allow=tcp:80 --target-tags=http-server

# 3. SSH in and install Docker
gcloud compute ssh tracker --zone=us-central1-a
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker $USER && exit

# 4. Clone + bring up
gcloud compute ssh tracker --zone=us-central1-a
git clone https://github.com/bharat98/Tracker.git
cd Tracker
docker compose up -d
# open http://<external-ip>:8080 in your browser
```

To put it behind port 80 so the URL is bare: either change `docker-compose.yml` port mapping to `"80:8080"`, or slap nginx/caddy in front.

**Cost after free trial:** $0/mo if you stay on `e2-micro` in a free-tier region.

**Pulling your data down to your laptop:**
```bash
gcloud compute scp tracker:/var/lib/docker/volumes/tracker_tracker_data/_data/tracker.db ./tracker.db --zone=us-central1-a
```

---

## Path B — Cloud Run (serverless, scales to zero)

Cloud Run is great because you don't manage servers, but SQLite + Cloud Run has one wrinkle: the default filesystem is ephemeral. For a single-user tracker you have two options:

1. **Mount a GCS bucket as a volume** (Gen2, supported since 2024). Your SQLite file lives in the bucket, survives restarts.
2. **Use Litestream** to continuously replicate the SQLite file to GCS. More reliable for writes, slight extra config.

### Option B.1 — Cloud Run with GCS volume mount

```bash
# 1. Bucket for the DB file
gcloud storage buckets create gs://tracker-db-$(gcloud config get-value project) \
  --location=us-central1

# 2. Build & deploy in one command (uses the Dockerfile in repo root)
gcloud run deploy tracker \
  --source=. \
  --region=us-central1 \
  --allow-unauthenticated \
  --execution-environment=gen2 \
  --add-volume=name=db,type=cloud-storage,bucket=tracker-db-$(gcloud config get-value project) \
  --add-volume-mount=volume=db,mount-path=/app/data
```

Cloud Run gives you an `https://tracker-<hash>-uc.a.run.app` URL. That's it.

**Free tier limits:** 2 M requests/mo, 360k vCPU-seconds, 180k GiB-seconds. A personal tracker uses a rounding error of that.

**Caveat:** GCS FUSE isn't designed for heavy concurrent writes. Fine for single-user, fine for low-frequency writes, not great if you ever have 50 people hammering it. When/if you outgrow it, migrate to Cloud SQL — 20 lines of code change.

### Option B.2 — Cloud Run + Cloud SQL (Postgres)

When you're ready for the "real" scalable version: Cloud SQL `db-f1-micro` is ~$7/mo (not free). Swap `better-sqlite3` for `pg`, keep the rest of the code unchanged. Postpone until you actually need it.

---

## Environment variables the server honors

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` local, `8080` in Docker | HTTP port |
| `DB_PATH` | `./data/tracker.db` | Path to the SQLite file |
| `NODE_ENV` | unset | `production` enables serving built client from `server/public` |

---

## Running locally (no GCP involved)

```bash
npm run install-all
npm run dev           # client :5173, server :3000, Vite proxies /api
```

Or build + run everything off the server:
```bash
npm run build
npm start             # server :3000 serves API + built client
```

Or run the production container locally to mirror Cloud Run exactly:
```bash
docker compose up
# http://localhost:8080
```
