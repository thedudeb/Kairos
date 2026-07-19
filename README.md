# Kairos

Kairos is a local-first recruitment pipeline with public job applications,
resume management, configurable stages, analytics, templates, webhooks, and
team roles.

The runtime has no Google Cloud Storage or generative-AI dependency. Resume
files stay on the local filesystem; parsing, match scoring, and outreach drafts
use deterministic code that performs no model API calls.

## Local stack

| Area | Technology |
| --- | --- |
| Frontend | Next.js 16 / React 19 |
| API | FastAPI / SQLModel |
| Database | PostgreSQL 16 |
| Background jobs | Redis / ARQ |
| File storage | Local filesystem (`LOCAL_UPLOAD_DIR`) |
| Resume parsing | `pdfplumber` plus local extraction rules |
| Match scoring | Explainable keyword and experience heuristics |
| Outreach drafts | Deterministic local templates |
| Authentication | Auth.js with Google OAuth; optional local demo mode |
| Email | Optional Resend integration |

Google OAuth does not use Gemini, GCS, Cloud Run, or billable Google Cloud
compute. If an entirely Google-free authentication flow is desired, it can be
replaced separately with a password or passkey provider.

## Start locally

Prerequisites: Docker, Node.js 20+, and `uv`.

```bash
docker compose up -d postgres redis

cd backend
cp .env.example .env
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000
```

In another terminal:

```bash
cd backend
uv run arq app.worker.main.WorkerSettings
```

And the frontend:

```bash
cd frontend
cp .env.local.example .env.local
npm ci --legacy-peer-deps
npm run dev
```

Open <http://localhost:3000>.

The Codespaces helper can perform the database/bootstrap setup:

```bash
./scripts/codespaces-bootstrap.sh
```

## Required configuration

Backend:

- `DATABASE_URL`
- `AUTH_SECRET`
- `INTERNAL_API_KEY`
- `INITIAL_ADMIN_EMAIL`
- `FRONTEND_ORIGIN`
- `LOCAL_UPLOAD_DIR` — defaults to `/tmp/recruitment-uploads`; use a persistent
  mounted directory for durable deployments.

Frontend:

- `AUTH_SECRET`
- `AUTH_URL`
- `BACKEND_URL`
- `INTERNAL_API_KEY`
- `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` for Google sign-in.

Optional:

- `REDIS_URL` — without Redis, submissions still work but background parsing
  must be triggered after Redis is available.
- `RESEND_API_KEY` — without it, email delivery is logged and skipped.
- `DEMO_ENABLED=true` on both services enables the passwordless local demo
  administrator. Never enable it on a public production deployment.

There are no `GEMINI_*`, `GCS_BUCKET`, Google service-account, Cloud Run, or
Cloud Build settings.

## Local parsing and scoring

The worker extracts PDF text with `pdfplumber`, then conservatively identifies
contact information, education hints, and a fixed vocabulary of skills. Fields
that cannot be identified confidently are left blank for manual correction.

Match scores are transparent heuristics based on job/resume term overlap,
identified skills, work entries, and education entries. They are intended only
as sorting assistance and should not be used as an automated hiring decision.

## Migrating away from existing Google Cloud resources

The application will never fetch a legacy `gs://` path. Before shutting down an
old bucket, export required resumes into `LOCAL_UPLOAD_DIR` and update their
stored paths to `local://...`. Legacy cloud-only resumes appear unavailable and
must be re-uploaded locally.

Removing the Cloud Run/Cloud Build files from this repository prevents future
deployments, but it does not delete already-running Google Cloud resources.
After data export, stop or delete Cloud Run services, stop Cloud SQL, remove
Cloud Build triggers, and delete unused buckets from the Google Cloud console
to end their charges. Those destructive account operations are intentionally
not automated by this repository.

## Tests

```bash
cd backend && uv run pytest
cd frontend && npm run build
```
