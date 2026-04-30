# Kairos

A full-stack recruitment intelligence platform built as a take-home interview project.
Fully functional with public job pages, AI resume parsing, an analytics dashboard,
configurable Kanban pipeline, templates, webhook integrations, Google OAuth, and email.

## Features

### Public portal
- Apply to jobs via a custom form (default + configurable extra fields)
- Resume PDF upload (validated, 10 MB max)
- Confirmation email on submission (Resend)
- Deduplication per job by email address
- "Closed" page for inactive listings

### Admin dashboard
- Google OAuth login; first-admin bootstrap via `INITIAL_ADMIN_EMAIL`
- **Job management** — create, edit, publish/close job listings with custom URL slugs
- **Applicant list** — sortable, filterable, full-text searchable, with grouping (by stage / institution / degree) and CSV export
- **Applicant detail** — parsed resume intelligence (name, education, work, skills), activity timeline, pipeline-stage mover, admin notes, re-parse button, and **manual correction editor**
- **Kanban board** — drag-and-drop between pipeline stages with optimistic UI
- **Stage management** — add, rename, reorder, and delete stages from a dedicated "Manage stages" panel (Board ↔ Manage toggle)
- **Analytics dashboard** — 5 Recharts visualizations: application volume (area chart), stage breakdown (bar), parse-status distribution (donut), top institutions (bar), degree distribution (donut)
- **Form builder** — add custom fields to application forms; select from reusable templates
- **Assessment templates** — reusable libraries for form fields and assessment questions
- **Integrations** — per-job webhooks triggered on stage transitions; configurable URL + encrypted API key; per-question assessment payload; delivery log with manual retry

### Resume intelligence (async)
- Async PDF text extraction via `pdfplumber`
- Structured data extraction via Gemini (name, email, phone, education, work, skills)
- Graceful degradation when Gemini key is missing (skips parsing, no crash)
- Re-parse on demand; "Parsing…" spinner; manual correction UI

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router, TypeScript), Tailwind CSS, shadcn/ui, Auth.js v5 |
| Backend | Python 3.12, FastAPI, SQLModel, Alembic, ARQ |
| Database | PostgreSQL 16 |
| Queue | Redis 7 (Upstash in prod) |
| File storage | Google Cloud Storage (local `/tmp` fallback in dev) |
| AI | Gemini 2.5 Pro (`google-genai`) |
| Email | Resend |
| Auth | Google OAuth, JWT (HS256) |
| Drag-and-drop | `@dnd-kit/core` + `@dnd-kit/sortable` |
| Charts | Recharts |
| Deployment | Vercel (frontend), Google Cloud Run x2 from one Docker image (backend + worker) |

## Local development

### Prerequisites

- Node.js 22 (`brew install node@22`)
- pnpm 10 (`npm install -g pnpm@10`)
- Python 3.12 (managed automatically by `uv`)
- `uv` (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- Docker Desktop (for local Postgres + Redis)

### One-time setup

```bash
# 1. Start Postgres + Redis
docker compose up -d

# 2. Backend — install deps, create DB schema, seed demo data
cd backend
uv sync
cp .env.example .env          # fill in the four required keys below
uv run alembic upgrade head
uv run python -m scripts.seed  # 1 job + 30 realistic applicants

# 3. Frontend
cd ../frontend
pnpm install
cp .env.local.example .env.local   # fill in the same four keys
```

### Required environment variables

| Key | Where | How to get it |
|-----|-------|--------------|
| `GOOGLE_CLIENT_ID` | frontend + backend | [GCP → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials); add `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI |
| `GOOGLE_CLIENT_SECRET` | frontend + backend | same credential above |
| `AUTH_SECRET` | frontend + backend | `openssl rand -base64 32` — **must be identical in both** |
| `INITIAL_ADMIN_EMAIL` | backend only | your Google email address — grants admin on first sign-in |

Optional (gracefully skipped when absent):

| Key | Purpose |
|-----|---------|
| `GEMINI_API_KEY` | Resume AI parsing (pdfplumber still runs; structured fields just stay empty) |
| `RESEND_API_KEY` | Confirmation emails (logged to stdout instead) |
| `GCS_BUCKET` | File storage (falls back to local `/tmp/recruitment-uploads/`) |
| `REDIS_URL` | Background job queue (submissions still work; parse jobs skip enqueue) |

### Running

```bash
# Terminal 1 — backend API
cd backend && uv run uvicorn app.main:app --reload --port 8000

# Terminal 2 — background worker (optional; needed for resume parsing)
cd backend && uv run arq app.worker.WorkerSettings

# Terminal 3 — frontend
cd frontend && pnpm dev
```

Visit **http://localhost:3000** — sign in with Google, and the demo job will be there with 30 seeded applicants.

API docs (Swagger): **http://localhost:8000/docs**

## Repo layout

```
.
├── frontend/
│   ├── app/
│   │   ├── admin/            # All admin pages (jobs, applicants, pipeline, settings, integrations)
│   │   ├── api/              # Next.js API routes (CSV export proxy, pipeline proxy, auth)
│   │   └── jobs/[slug]/      # Public application form
│   ├── components/
│   │   ├── admin/            # Analytics charts, template editor, kanban board, …
│   │   └── ui/               # shadcn/ui primitives + skeleton loaders
│   ├── lib/                  # backendFetch, auth helpers, utils
│   └── types/                # TypeScript interfaces mirroring backend schemas
│
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app + lifespan (ARQ pool)
│   │   ├── models/           # SQLModel table definitions
│   │   ├── routers/          # HTTP endpoints
│   │   │   ├── public.py     # Unauthenticated: job page + apply
│   │   │   ├── applicants.py # Admin: list, detail, stage, notes, reparse, correction
│   │   │   ├── pipeline.py   # Admin: stage CRUD + reorder
│   │   │   ├── analytics.py  # Admin: aggregated chart data
│   │   │   ├── export.py     # Admin: CSV export
│   │   │   ├── integrations.py # Admin: webhooks + delivery log
│   │   │   ├── jobs.py       # Admin: job CRUD + form fields
│   │   │   └── templates.py  # Admin: template CRUD
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   ├── services/         # storage, email, webhook
│   │   └── worker/           # ARQ task definitions (resume parsing)
│   ├── alembic/              # DB migrations
│   ├── scripts/
│   │   └── seed.py           # 30-applicant demo data
│   ├── Dockerfile            # Single image; used by both Cloud Run services
│   ├── service-api.yaml      # Cloud Run manifest — uvicorn
│   └── service-worker.yaml   # Cloud Run manifest — arq
│
├── docs/
│   └── architecture.md       # Full system design, tradeoffs, deployment topology
├── docker-compose.yml        # Local Postgres + Redis
├── cloudbuild.yaml           # GCP CI/CD pipeline
└── .devcontainer/            # GitHub Codespaces configuration
```

## Deployment

### Vercel (frontend)

```bash
cd frontend
vercel deploy --prod
```

Set `BACKEND_URL`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `NEXTAUTH_URL` in Vercel project settings.

### Google Cloud Run (backend)

```bash
# Build and push image
gcloud builds submit --config cloudbuild.yaml backend/

# Deploy API service
gcloud run services replace backend/service-api.yaml --region us-central1

# Deploy worker service
gcloud run services replace backend/service-worker.yaml --region us-central1
```

All secrets are read from Secret Manager (see `service-api.yaml` for the full list).

### Production URLs (submissions)

Fill in after deployment so reviewers can test your hosted build:

| Surface | URL |
|---------|-----|
| Frontend (admin dashboard + careers portal) | `https://YOUR_FRONTEND.vercel.app` |
| Backend API (Swagger at `/docs`) | `https://YOUR_CLOUD_RUN_URL` |

Important paths:

- Public **careers index** (demo-friendly listing): `/careers`
- Individual job pages: `/careers/{slug}`
- Admin: `/admin`

Point `BACKEND_URL` (frontend env) at your deployed API, and set `AUTH_URL` / `NEXTAUTH_URL` to match your frontend origin.

## Architecture notes

See [`docs/architecture.md`](docs/architecture.md) for the detailed write-up, including:
- Why Next.js on Vercel + FastAPI on Cloud Run (not a monolith)
- One Dockerfile, two Cloud Run services (API vs worker)
- Webhook idempotency via `transition_id`
- Fernet-encrypted API keys
- Signed-URL file access (GCS) with local fallback
- Graceful degradation for every external service

## License

Private — interview submission.
