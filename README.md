# Kairos

A full-stack recruitment intelligence platform built as a take-home interview project.
Public job pages, AI resume parsing, an analytics dashboard, configurable Kanban
pipeline, reusable templates, webhook integrations, Google OAuth, and email.

## Live demo

| Surface | URL |
|---|---|
| Frontend (admin dashboard + public careers portal) | `https://frontend-rho-five-38.vercel.app` |
| Backend API (OpenAPI / Swagger at `/docs`) | `https://recruitment-api-189067700467.us-central1.run.app` |

Public paths:

- Individual job listings: `/careers/{slug}` (the spec's required entry point — direct-link only, `noindex` / `nofollow` / `nollms`)
- Optional careers index (browse all active jobs): `/careers` (also `noindex` — not linked from anywhere in the product, accessible only by direct URL, exists because the demo deliverable list references it)
- Admin: `/admin` (Google sign-in or "Try demo")

---

## Features

### Public portal
- Apply to jobs via a customisable form (default fields + admin-configured custom fields)
- Client-side validation: required fields, email format, phone format (E.164-ish), PDF-only resume, 10 MB max
- Server-side validation mirrors the client; surfaces specific backend error messages (duplicate email, closed job, file-size, etc.) instead of generic copy
- Confirmation email on submission (Resend)
- Per-job email deduplication; same email *can* apply to different jobs
- "Position closed" page for inactive listings

### Admin dashboard
- Google OAuth sign-in; first-admin bootstrap via `INITIAL_ADMIN_EMAIL`
- **Strict access control** — only invited users + bootstrap admin + demo account can sign in; everyone else gets a clear *"This account isn't authorized to access this workspace"* message on the sign-in page
- **Job management** — create, edit, publish/close job listings with custom URL slugs
- **Custom form builder** — add fields of every type (text, textarea, dropdown w/ options, file upload); rejects empty labels and empty dropdown options at FE+BE layers; drag-and-drop reorder; live red-border validation
- **Reusable templates** — bundles of custom fields + assessment questions; snapshot-applied to jobs (edits to a template don't retroactively change jobs)
- **Applicant list** — sort, filter, group, full-text search, CSV export; stage filter pills show correct counts that respect all other filters
- **Applicant detail** — embedded resume PDF (browser-native viewer), structured parsed intelligence, AI fit score, activity timeline, admin notes (CRUD), manual correction editor for parsed fields, working re-parse button
- **Kanban board** — drag-and-drop between stages with optimistic UI; real backend errors surfaced (no silent failures); intra-column reorder
- **Stage management** — add, rename, reorder, delete stages with proper FK handling (applicants in a deleted stage are reassigned or the delete is rejected with a clear message)
- **Analytics dashboard** — 5 Recharts visualisations: application volume, stage breakdown, parse status, top institutions, degree distribution
- **Webhook integrations** — per-job, per-stage; configurable URL + encrypted API key; optional assessment payload; delivery log + manual retry + dedup against accidental double-fires; resume URL embedded in payloads is a short-lived token-signed link that external receivers can actually fetch

### Resume intelligence
- Async PDF text extraction via `pdfplumber`
- Structured data extraction via Gemini 2.5 Flash (name, email, phone, education, work, skills)
- **Typed failure modes**: distinct exceptions for unreadable PDFs, image-only PDFs (OCR-required), transient Gemini errors (auto-retried with exponential backoff), permanent Gemini errors, and unparseable responses — each surfaces an admin-friendly message instead of a stack trace
- Stuck-pending detection: if a parse hasn't started after 2 minutes, the admin sees a clear *"worker may be unavailable"* warning with a working Re-parse button
- Re-parse on demand; manual correction UI; original PDF always accessible regardless of parse status

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router, TypeScript), Tailwind v4, Auth.js v5, `@dnd-kit/*`, Recharts |
| Backend | Python 3.12, FastAPI, SQLModel, Alembic, ARQ |
| Database | PostgreSQL 16 (Cloud SQL in prod) |
| Queue | Redis 7 (Upstash in prod) |
| File storage | Google Cloud Storage (local `/tmp` fallback in dev) |
| AI | Google Gemini 2.5 Flash (`google-genai`) |
| Email | Resend |
| Auth | Google OAuth + JWT (HS256, distinct token types for session vs resume share) |
| Deployment | Vercel (frontend, auto-deploys from `main`), Google Cloud Run × 2 from one Docker image — `recruitment-api` (uvicorn) + `recruitment-worker` (arq). Cloud Build trigger auto-deploys both on push to `main`. |

See [`docs/architecture.md`](docs/architecture.md) for the detailed design write-up.

---

## Local development

### Prerequisites

- Node.js 22 — `brew install node@22`
- Python 3.12 — managed automatically by `uv`
- `uv` — `curl -LsSf https://astral.sh/uv/install.sh | sh`
- Docker Desktop (for local Postgres + Redis)

### One-time setup

```bash
# 1. Start Postgres + Redis
docker compose up -d

# 2. Backend — install deps, create schema, seed demo data
cd backend
uv sync
cp .env.example .env             # fill in the required keys below
uv run alembic upgrade head
uv run python scripts/seed.py    # 3 jobs + 65 realistic applicants

# 3. Frontend
cd ../frontend
npm install --legacy-peer-deps
cp .env.local.example .env.local
```

### Required environment variables

Three of the five are shared between frontend and backend — they **must be identical in both** `backend/.env` and `frontend/.env.local`.

| Key | Where | How to get it |
|---|---|---|
| `AUTH_GOOGLE_ID` | frontend | [GCP → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials); add `http://localhost:3000/api/auth/callback/google` as an authorised redirect URI |
| `AUTH_GOOGLE_SECRET` | frontend | same credential above |
| `AUTH_SECRET` | both | `openssl rand -base64 32` — **must be identical in both** |
| `INTERNAL_API_KEY` | both | `openssl rand -hex 32` — **must be identical in both** |
| `INITIAL_ADMIN_EMAIL` | backend | your Google email — granted `admin` role on first sign-in |

Optional (gracefully skipped when absent):

| Key | Purpose | Fallback when missing |
|---|---|---|
| `GEMINI_API_KEY` | Resume parsing | pdfplumber still runs; structured fields stay empty; UI shows the friendly low-confidence banner |
| `RESEND_API_KEY` | Confirmation emails | Logged to stdout instead of sent |
| `GCS_BUCKET` | File storage | Falls back to local `/tmp/recruitment-uploads/`, served by the dev-only `/public/files/{filename}` route |
| `REDIS_URL` | Background job queue | Submissions still work; parse jobs aren't enqueued (applicants get the stuck-pending warning) |
| `PUBLIC_API_URL` | Externally-reachable base URL of the backend, used for token-signed resume URLs embedded in outbound webhook payloads | Defaults to `http://localhost:8000` — fine for dev. In production, set this to your Cloud Run service URL so external webhook receivers can fetch resumes. |

### Running

```bash
# Terminal 1 — backend API
cd backend && uv run uvicorn app.main:app --reload --port 8000

# Terminal 2 — background worker (required for resume parsing + AI fit scoring)
cd backend && uv run arq app.worker.WorkerSettings

# Terminal 3 — frontend
cd frontend && npm run dev
```

Visit **<http://localhost:3000>** — click **"Try demo"** to log in instantly (no Google credentials needed), or sign in with your `INITIAL_ADMIN_EMAIL` via Google. Three seeded jobs with 65 realistic applicants will be waiting.

Interactive API reference: **<http://localhost:8000/docs>** (Swagger). See also [`docs/API.md`](docs/API.md) for a concise list of staff-only routes.

### GitHub Codespaces / clean machine

```bash
docker compose up -d                       # Postgres + Redis
bash scripts/codespaces-bootstrap.sh       # auto-generates matching .env files,
                                           # runs migrations, seeds demo data
```

The bootstrap script is idempotent — re-runs are safe and skip the seed when data already exists. It also auto-generates matching `AUTH_SECRET` + `INTERNAL_API_KEY` in both env files, which is a common gotcha when setting up by hand. In Codespaces this runs automatically on container start.

---

## Deployment

### Frontend → Vercel

Auto-deploys from `main` via the Vercel GitHub integration. To deploy manually:

```bash
cd frontend && vercel deploy --prod
```

Required Vercel env vars: `BACKEND_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_URL`, `INTERNAL_API_KEY`.

### Backend → Google Cloud Run

Auto-deploys from `main` via the Cloud Build trigger `deploy-on-main`. Every push to `main` runs [`cloudbuild.yaml`](cloudbuild.yaml), which:

1. Builds the backend Docker image
2. Tags it with the short commit SHA + `latest`
3. Pushes to Artifact Registry
4. Updates both `recruitment-api` and `recruitment-worker` Cloud Run services in parallel

Total deploy time: ~2–3 minutes. To trigger a manual deploy without pushing:

```bash
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_TAG=$(git rev-parse --short HEAD) .
```

Required Cloud Run env vars (all stored in Secret Manager and referenced by name): `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `INTERNAL_API_KEY`, `INITIAL_ADMIN_EMAIL`, `GCS_BUCKET`, `RESEND_API_KEY`, `GEMINI_API_KEY`, `FRONTEND_ORIGIN`, `PUBLIC_API_URL`.

---

## Repo layout

```
.
├── frontend/                        # Next.js 16 app — admin dashboard + public careers portal
│   ├── app/
│   │   ├── admin/                   # All admin pages
│   │   ├── api/                     # Next.js route handlers (proxy to backend, auth)
│   │   ├── careers/                 # Public job pages + careers index
│   │   └── sign-in/                 # Auth landing
│   ├── components/                  # Shared UI primitives + admin-specific components
│   ├── lib/                         # backendFetch, auth helpers, utils
│   ├── types/                       # TypeScript interfaces mirroring backend schemas
│   └── public/                      # Static assets, including the synced pdfjs worker
│
├── backend/                         # FastAPI app + ARQ worker (one Docker image, two services)
│   ├── app/
│   │   ├── main.py                  # FastAPI app + lifespan (ARQ pool, CORS, security headers)
│   │   ├── config.py                # pydantic-settings config
│   │   ├── models/                  # SQLModel table definitions
│   │   ├── routers/                 # HTTP endpoints (jobs, applicants, pipeline, integrations, …)
│   │   ├── schemas/                 # Request/response Pydantic schemas
│   │   ├── services/                # Storage, email, webhook, ranking
│   │   ├── worker/                  # ARQ task definitions (parse_resume, rank_applicant)
│   │   ├── utils/                   # LLM JSON extractor, shared helpers
│   │   └── security.py              # JWT issuance/verification (session + resume-share token types)
│   ├── alembic/                     # DB migrations
│   ├── scripts/
│   │   ├── seed.py                  # 3-job, 65-applicant demo data
│   │   └── revoke_unauthorized_users.py  # One-off cleanup (dry-run by default)
│   └── Dockerfile                   # Single image, used by both Cloud Run services
│
├── docs/
│   ├── architecture.md              # System design, tradeoffs, deployment topology
│   ├── API.md                       # Staff-only HTTP routes reference
│   ├── demo-script.md               # 10-15 min walkthrough for the recorded demo
│   └── PRE-SUBMISSION-CHECKLIST.md  # Per-rubric-item verification protocol — walk through before any submission
│
├── docker-compose.yml               # Local Postgres + Redis
├── cloudbuild.yaml                  # Cloud Build pipeline (builds image, deploys both services)
├── vercel.json                      # Frontend monorepo build config
└── .devcontainer/                   # GitHub Codespaces configuration
```

---

## Architecture highlights

Full write-up in [`docs/architecture.md`](docs/architecture.md). The short version:

- **Two services from one image** — `recruitment-api` (uvicorn HTTP) and `recruitment-worker` (arq) share the same Docker image; they differ only in the start command. This keeps API and worker code in lockstep and means `gcloud builds submit` can deploy both in parallel.
- **Snapshot, not link, for templates → jobs** — applying a template copies the fields onto the job; later edits to the template don't retroactively change the job. Templates can be deleted even after being applied (the FK is nulled out).
- **Async parsing pipeline** — submission returns immediately; the parse + AI fit-score chain runs in the worker via Redis-backed ARQ.
- **Typed parse failures** — 5 distinct exception classes, each with an admin-friendly message and a `retryable` hint that drives the UI's Re-parse button visibility.
- **Token-signed resume URLs in webhook payloads** — the resume URL embedded in outbound webhook payloads is a 1-hour JWT (HS256, distinct `type: resume_share` claim) pointing at a public `/public/resume/{token}` endpoint. External receivers can fetch it without our admin session, and the token can't be reused as a session credential.
- **Webhook idempotency** — `(applicant_id, stage_id, attempt_number)` key prevents double-fires from UI double-clicks or internal retries on a request that actually succeeded.
- **Fernet-encrypted webhook API keys** — admins paste the third-party bearer token once; we encrypt at rest and only decrypt at delivery time.
- **Strict access control** — Google sign-in is gated on: (a) email matches `INITIAL_ADMIN_EMAIL`, (b) the user has a pending `UserInvite` row, (c) it's the very first user, or (d) it's the demo account. Everyone else is rejected at the user-sync endpoint with a clear UI message.

---

## Operational scripts

| Script | Purpose |
|---|---|
| `backend/scripts/seed.py` | Insert 3 jobs + 65 applicants for demo/dev |
| `backend/scripts/revoke_unauthorized_users.py` | Find and (with `--commit`) remove User rows that aren't an admin, the bootstrap email, the demo account, or matched by a pending invite. Dry-run by default. Useful after enabling the auth lockdown if your environment had legacy unauthorised accounts. |

---

## Quality bar

Before any review submission or demo, walk through [`docs/PRE-SUBMISSION-CHECKLIST.md`](docs/PRE-SUBMISSION-CHECKLIST.md) against the deployed URL in clean Chrome incognito. The checklist covers every rubric line item — every form validation case, every kanban stage operation, every parse outcome, the webhook payload shape, the auth lockdown rejection path, mobile viewport, cursor states. Ten minutes of structured testing catches what *"oh I'll test it later"* always misses.

---

## License

Private — interview submission.
