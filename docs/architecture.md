# Architecture Overview

## High-level diagram

```
                          +---------------------------+
                          |       Vercel (CDN)        |
                          |                           |
   Applicant browser ---> |   Next.js 15 App Router   |
   Admin browser     ---> |   - Public job pages      |
                          |   - Admin dashboard       |
                          |   - Auth.js (Google OAuth)|
                          |   - BFF proxy             |
                          +---------+-----------------+
                                    |  signed JWT
                                    v
+-----------------------------------------------------+
|                  Google Cloud (GCP)                 |
|                                                     |
|   +---------------+         +---------------+       |
|   |  Cloud Run:   |         |  Cloud Run:   |       |
|   |     api       | enqueue |    worker     |       |
|   |  (FastAPI)    | ------> |    (ARQ)      |       |
|   +-------+-------+   via   +-------+-------+       |
|           |          Redis          |               |
|           v                         v               |
|   +---------------+         +---------------+       |
|   | Cloud SQL     |         | Upstash Redis |       |
|   | Postgres 16   |         | (job queue)   |       |
|   +---------------+         +---------------+       |
|           |                         |               |
|           v                         v               |
|   +---------------+         +-----------------+     |
|   | Cloud Storage |         | Gemini 2.5 Pro  |     |
|   | (resumes)     |         | structured out  |     |
|   +---------------+         +-----------------+     |
|                                     |               |
|                                     v               |
|                             +-----------------+     |
|                             | Resend (email)  |     |
|                             | Webhook URLs    |     |
|                             +-----------------+     |
+-----------------------------------------------------+
```

## Stack

| Layer        | Choice                                                              |
|--------------|---------------------------------------------------------------------|
| Frontend     | Next.js 15+ (App Router, TS), Tailwind, shadcn/ui, TanStack Query   |
| Auth         | Auth.js v5 (NextAuth) with Google OAuth                             |
| Backend API  | FastAPI (Python 3.12), SQLModel, Alembic, Pydantic v2               |
| Worker       | ARQ (Redis-based async job runner) — same image, separate service   |
| Database     | Postgres 16 (Cloud SQL in prod, Docker locally)                     |
| Queue/cache  | Redis 7 (Upstash in prod, Docker locally)                           |
| File storage | Google Cloud Storage with signed URLs                               |
| LLM          | Gemini 2.5 Pro with Pydantic-typed structured output                |
| Email        | Resend                                                              |
| Hosting      | Vercel (frontend) + Google Cloud Run (api + worker)                 |

## Backend deployment topology

Single `backend/Dockerfile`, built once per release, deployed as **two Cloud Run services**:

```
gcloud builds submit backend/ --tag $IMAGE
gcloud run deploy api    --image=$IMAGE --command=uvicorn --args="app.main:app,--host,0.0.0.0,--port,8080"
gcloud run deploy worker --image=$IMAGE --command=arq      --args="app.worker.WorkerSettings" \
       --no-cpu-throttling --min-instances=1
```

This gives independent scaling, independent logs, and independent health checks while
keeping CI to a single image build. Considered and rejected: collapsing both processes
into one service via supervisord — Cloud Run scales on HTTP concurrency only, the worker
needs `--no-cpu-throttling` to make progress between requests anyway, and supervisord
hides worker health from Cloud Run's own probes.

## Authentication flow

```
1. User clicks "Sign in with Google"
2. Auth.js redirects to Google OAuth consent
3. Google returns code -> Auth.js exchanges for tokens
4. Auth.js `signIn` callback POSTs to FastAPI /internal/auth/sync
   (server-to-server, authenticated with INTERNAL_API_KEY shared secret)
   payload: { email, name, image }
5. FastAPI:
   - Looks up user by email
   - If not found AND email == INITIAL_ADMIN_EMAIL -> create with role=admin
   - If not found AND no users exist yet -> create with role=admin (bootstrap)
   - Otherwise -> create with role=admin (single-role MVP)
   - Returns user record
6. Auth.js stores user.id and user.role in the session JWT
   (HS256, signed with AUTH_SECRET shared between frontend and backend)
7. On API calls, the frontend BFF includes the session JWT as
   `Authorization: Bearer <jwt>` to the FastAPI service
8. FastAPI middleware verifies the JWT signature with AUTH_SECRET,
   loads the user from Postgres, and attaches them to request.state.user
```

## Key data-model decisions

- **Template-to-job propagation = snapshot.** Applying a template copies its custom
  fields and assessment questions onto the job. Later edits to the template do not
  retroactively change live jobs. Predictable for admins, simpler data model.
- **Per-job pipelines.** `pipeline_stages` is per-job, not global. Default stages are
  seeded on job creation; admins can rename, reorder, and delete from there.
- **Stage transitions are first-class rows.** `stage_transitions(transition_id, applicant_id,
  from_stage_id, to_stage_id, actor_id, created_at)` is the source of truth for the
  activity timeline AND the idempotency key for outbound webhooks.
- **Per-job dup-email rule.** `applicants` has a unique constraint on `(job_id, email)`.
  Same email can apply to different jobs.
- **Parsed resume = structured + raw.** A `parsed_resume` row stores the full JSONB
  blob from the LLM plus normalized columns (top institution, top degree) that the
  filter/sort/group queries hit directly. Detail rows for education/work/skills are
  separate child tables for proper filtering.
- **Job description modes.** Each job stores `description_kind`: either **`markdown`**
  (full in-portal body in `description_md`) or **`external`**, where the canonical
  JD lives at an HTTPS `description_external_url` and the public page surfaces a
  prominent outbound link (with optional short `description_summary` for context).
- **Per-field file allowlists.** Custom `file` form fields may declare
  `file_allowed_types` (MIME strings such as `application/pdf`). When omitted, the
  server falls back to the global safe allowlist; public apply validates each
  uploaded file against its field’s declaration.

## Webhook idempotency

- Each `stage_transitions` row gets a server-generated UUID `transition_id`.
- The worker, before sending the outbound POST, INSERTs into `webhook_deliveries`
  with a unique constraint on `(transition_id, integration_id)`. Duplicate insert =
  duplicate trigger = silently dropped.
- Manual admin retries reuse the `transition_id` but insert a new row with
  `manual_retry=true`. The downstream service sees this as a re-send.

## Async resume parsing

```
Submit application
    -> insert applicants row with parse_status=pending
    -> upload resume to GCS
    -> enqueue arq job: parse_resume(applicant_id, gcs_path)
    -> return 201 to applicant immediately

Worker:
    -> set parse_status=parsing
    -> download PDF from GCS
    -> extract text via pdfplumber
    -> call Gemini with response_schema=ParsedResume (Pydantic)
    -> upsert parsed_resume + applicant_education[] + applicant_work[] + applicant_skills[]
    -> set parse_status=parsed (or failed with last_error)
```

If parsing fails, the admin can hit `POST /applicants/{id}/parse/retry` to re-enqueue.

## Environment-variable bootstrap for first admin

The very first admin doesn't exist yet — there's no one to invite them. We solve this
with `INITIAL_ADMIN_EMAIL`. The first time someone with that email signs in via Google
OAuth, the user-sync endpoint creates them with `role=admin`. All subsequent admins
can be added by an existing admin (out of scope for the MVP).

## Scaling notes

- **Postgres**: read-heavy dashboard queries are fine on a single Cloud SQL instance
  for thousands of applicants. Add a read replica if list/analytics latency grows.
- **Worker**: bumping concurrency on a single worker instance is the first lever; if
  parsing or webhook backlogs grow, scale `worker` Cloud Run service horizontally
  (the queue handles distribution).
- **API**: stateless; Cloud Run scales it on request concurrency. Use `min-instances=1`
  on `api` to avoid cold starts on the public job pages.
