# Kairos — Demo Video Script

**Target length:** 13–14 minutes
**Format:** read directly; bracketed lines are on-screen actions

URLs to have open in tabs before recording:
- Admin: `https://frontend-rho-five-38.vercel.app/admin`
- Careers: `https://frontend-rho-five-38.vercel.app/careers`
- API docs: `https://recruitment-api-189067700467.us-central1.run.app/docs`
- Webhook receiver: `https://webhook.site` (open a fresh URL before you start)
- Resend dashboard or Gmail (to show the confirmation email)

---

## 0:00 — Cold open (30s)

[Screen: admin dashboard, showing the seeded jobs]

> Hi — this is Kairos, a recruitment intelligence platform I built as a take-home project. It's a multi-tenant hiring tool with a public application portal, an AI-driven resume parser, a configurable Kanban pipeline, an analytics dashboard, and a webhook integration system that lets it slot into existing recruiting stacks.
>
> The stack is Next.js 16 with the App Router on the frontend, FastAPI with SQLModel on the backend, PostgreSQL 16 for storage, Redis for the background job queue, Google Cloud Storage for resume PDFs, Gemini 2.5 Pro for the AI parsing, Resend for transactional email, and Google OAuth for admin auth. It's deployed on Vercel and Google Cloud Run.
>
> Let me walk through it.

---

## 0:30 — Templates (1m 30s)

[Click into "Templates" from the admin landing page]

> Templates are the first abstraction. The spec required reusable role configurations, so I built templates as bundles of two things: custom application form fields, and assessment questions. The same template can be applied to many jobs.

[Click an existing template to open it]

> Here's the "Senior Software Engineer" template. On the left you've got form fields — things like "GitHub URL," "Years of experience," "Work authorization." Each field has a type — text, textarea, file, dropdown, email, URL, number, checkbox — a required toggle, and dropdown options if needed. I'm using `@dnd-kit/sortable` for the drag-and-drop reordering, which keeps the implementation lean and accessible.

[Drag a field to reorder it]

> On the right are the assessment questions. Each one has a max recording duration and a max attempt count, which a downstream video assessment platform would consume. New templates start with four questions by default, which the spec asked for.

[Click the "Preview" button]

> Preview shows both halves — what the applicant will see and what the assessment platform will receive. Templates are global, so duplicating one is a one-click variation.

[Go back to templates list, click duplicate]

> When I apply a template to a job, it does a snapshot copy — not a live link. That's an architecture decision I made early. A linked template would mean every template edit silently mutates published job forms, which is dangerous for compliance. With a snapshot, each job's form is self-contained and auditable.

---

## 2:00 — Job Management (1m 30s)

[Navigate back to admin landing, click "New job"]

> New jobs default to "Draft" status, which the spec required. The admin can finish configuring before publishing.

[Fill in title "Product Designer", let slug auto-generate, paste a short description, select the SWE template]

> The slug is auto-generated from the title but stays editable. Job descriptions accept markdown or an external URL — useful if HR maintains JDs in Notion or a Google Doc. I render markdown server-side.

[Save → land on the new job's overview]

> The job is created in Draft. Notice the URL — `/admin/jobs/{id}` — every admin view from here on is scoped to this job. That's a core spec requirement: each job is its own workspace with its own pipeline, applicants, and analytics.

[Click into Settings → form fields]

> The template's fields populated automatically. I can still edit them per-job — adding, removing, or reordering — without affecting the template. Same for the assessment questions.

[Add one custom field "Portfolio URL" → save]

> The pipeline got the default seven stages: Applied, Screening, Assessment, Interview, Offer, Hired, Rejected. Those are configurable per job.

[Click "Publish" / change status to Active]

> One click takes it from Draft to Active. The public URL is now live.

---

## 3:30 — The Public Application Portal (1m 30s)

[Open careers index in a new tab]

> The public side. The careers index is intentionally separate from the admin — it's a Server Component fetching only active jobs, with `noindex`, `nofollow`, `noarchive`, and the experimental `nollms` meta tags so the pages aren't scraped. The spec was strict on this — listings shouldn't be indexable.

[Click into a job, e.g. Senior Software Engineer]

> Each job has its own page with the description and the application form below it. The four required defaults — first name, last name, email, phone, resume — are always there, and the custom fields render in the order the admin set.

[Fill in fake details, upload a resume PDF]

> Resume uploads are validated client and server side: PDF only, 10MB max. The file goes to GCS via a streamed multipart upload — never lives on the API server's disk. In dev it falls back to local `/tmp` storage so you can run the whole stack without a GCS bucket.

[Click submit]

> On submit, I get an immediate confirmation. The applicant doesn't wait for parsing — that runs asynchronously.

[Switch to email tab, show the confirmation email]

> And here's the confirmation email — sent through Resend. If Resend's API key isn't configured the system logs the email instead of crashing, which is a graceful-degradation pattern I used for every external service.

[Try to submit a second application with the same email — show the error]

> Per-job email deduplication. The same person can apply to different jobs, but not twice to the same one.

---

## 5:00 — Admin Dashboard: Landing + Overview (1m 30s)

[Switch to admin, click into Senior Software Engineer]

> Back in admin. The landing page groups jobs by status — Active, Draft, Closed — with summary stats per job. I made the closed section collapsible because closed jobs are read-only and shouldn't compete for attention.

[Click into a job — overview]

> Inside a job, the overview is the centerpiece. Total applicants, new this week, new this month, current stage distribution. Below that, five Recharts visualizations: application volume over time — which is filterable by date range — top institutions, degree distribution, parse status, and stage breakdown.

[Hover over the volume chart, change the date range]

> Date filtering goes through URL search params, so the state is bookmarkable and shareable.

[Show the stage distribution]

> Notice the analytics are scoped to this one job. There's no cross-job analytics view — that was an explicit spec decision because hiring managers think one role at a time.

---

## 6:30 — Applicant List + Detail (2m 30s)

[Click "Applicants" tab]

> The applicant list. The spec required sort, filter, group, and full-text search — all of which are here.

[Demonstrate sort: click "Education" header]

> Sortable by application date, name, institution, degree, and stage.

[Open filter sheet, pick a stage and an institution]

> Filterable by stage, institution, degree, application date range, and a multi-select skills filter — the skills shown are dynamic, pulled from what's actually present in the applicant pool.

[Switch grouping to "Institution"]

> Groupable by institution, degree, or stage.

[Type a search term — e.g. "react"]

> Full-text search across name, email, institution, all the parsed structured data, and skills. The search query joins through Postgres' lower-case index.

[Click into one applicant]

> The detail view. On the left, the original PDF rendered inline using PDF.js. Then the parsed resume — name, email, phone, education with institution, degree, field of study, and dates, work history with company, title, and time periods, and skills.

[Scroll down]

> Below that, every custom field the applicant submitted, in the order the admin configured. Then the activity timeline — application received, every stage transition with timestamp, and admin notes interleaved chronologically.

[Show parse status badge]

> Resume parsing runs asynchronously through ARQ — that's the Python async job queue, backed by Redis. While parsing is in progress you'd see a "Parsing…" spinner here. If parsing fails, there's a Retry button. If the AI extracted something wrong, admins can manually correct any field.

[Click Edit on the parsed data]

> Manual corrections are stored alongside the AI-extracted data, so the original parse is never lost.

[Click "Add note", type a note, save]

> Admin notes are timestamped and authored — the spec called this out specifically.

---

## 9:00 — Pipeline (1m 30s)

[Click "Pipeline" tab]

> The Kanban board. Each stage is a column, applicants are cards. Cards show name, institution, program, and time-in-stage.

[Hover over a card]

> Time-in-stage auto-selects the unit — minutes, hours, days, weeks, months, years — based on magnitude. Spec was explicit about that compact format.

[Drag an applicant to a different stage]

> Drag and drop uses optimistic UI — the card moves instantly, the API call happens in the background, and the activity timeline gets updated. If the API fails the move reverts.

[Click "Manage stages"]

> I can add new stages, rename existing ones, drag to reorder, and delete. Deleting a stage requires confirmation, and stages with applicants in them are blocked from deletion until those applicants are moved out.

[Show a different job's pipeline with different stages]

> Different jobs can have totally different pipelines. A Software Engineer might have five stages, a Designer might have four. Each pipeline is fully independent.

---

## 10:30 — Team & Invites (1m)

[Click the "Team" link in the top-right of the admin header — visible to admins only]

> A quick word on team management. The spec required Google OAuth for the admin and a bootstrap mechanism for the first user — that's the `INITIAL_ADMIN_EMAIL` environment variable. Whoever's email matches that gets admin access automatically on their first sign-in. After that, an admin can invite teammates.

[Show the team settings page — list of staff users with their roles]

> Here's the current team. Each user has a role — Admin or Reviewer. Admins can do everything; reviewers have read-only access to applicants and analytics, can't create jobs, can't move stages, can't configure integrations. The split is enforced at the FastAPI dependency layer — every write endpoint uses a `require_admin` dependency, every read uses `require_staff`.

[Type an email into the invite form, pick a role, submit]

> Inviting someone is just an email plus a role. The invite gets stored as a pending row in the database. When that email signs in via Google OAuth for the first time, the auth-sync endpoint sees the invite, creates the user with the pre-assigned role, and deletes the invite atomically. So no shareable invite links, no tokens to leak, no expiry windows to manage — the email itself is the credential.

[Show the pending invites list, hover over revoke button]

> Pending invites are listed below, and admins can revoke before the user signs in.

[Click on an existing user's role dropdown and change it]

> An admin can also change roles after the fact — for instance, demoting an admin to a reviewer. Admins can't change their own role, which prevents accidentally locking yourself out of admin actions.

---

## 11:30 — Integrations (2m)

[Click "Integrations" tab]

> The integration system. The spec asked for a way to fire external API calls when applicants enter specific stages — typical use case is sending a candidate to an external video assessment platform.

[Click "New integration"]

> I configure: trigger stage, endpoint URL, an API key, whether to include the assessment questions in the payload, and an active/paused toggle. The URL and API key are admin-supplied — there's no hardcoded destination. The key is stored encrypted at rest using Fernet, so even a database compromise doesn't leak credentials.

[Paste a webhook.site URL, paste a fake API key, toggle assessment questions ON, save]

> Now let me trigger it.

[Switch to the Pipeline tab, drag an applicant into the trigger stage]

[Switch to webhook.site to show the payload arriving]

> There's the request. JSON body with `event: stage_transition`, a timestamp, the candidate block — name, email, phone, and a signed resume URL — the stage block, and the assessment block, which contains the template name and the full list of questions with their max duration and max attempts. The Authorization header has the bearer token I configured.

[Show the integration delivery log]

> Every delivery is logged with the response code, body, and timestamp. If the external service fails, the stage transition still completes — the spec was explicit that integrations must not block the pipeline. Failed deliveries can be manually retried, and there's idempotency protection: a unique constraint on `(transition_id, integration_id, attempt_number)` prevents the same stage move firing the webhook twice if someone double-clicks.

---

## 13:30 — Reporting + Architecture (1m 30s)

[Back to job overview, scroll to charts]

> Back to the analytics dashboard. The spec asked for application volume over time, distribution by institution and degree, and stage-by-stage counts — all rendering from job-scoped aggregation queries hitting Postgres directly.

[Click "Export CSV"]

> CSV export honors all the active filters, so you can export "everyone in Interview from Stanford" with one click. Export goes through a streamed `StreamingResponse` so we don't materialize the whole result set in memory.

[Brief architecture summary, no specific click — could just stay on dashboard]

> Quickly on architecture. The frontend is Next.js 16 on Vercel — Server Components for the data-heavy admin views, Client Components for the interactive bits like Kanban and the form builder. Auth is Auth.js v5 with Google OAuth, plus a credentials provider for a one-click demo login. The backend is FastAPI on Cloud Run, talking to Cloud SQL Postgres over a Unix socket, and ARQ workers run as a separate Cloud Run service from the same Docker image. Resume parsing goes Gemini 2.5 Pro for structured JSON extraction, with pdfplumber for the text layer. Every external service has a graceful-degradation path — no Gemini, no Resend, no GCS, no Redis — the app keeps working with reduced functionality.
>
> The full architecture write-up is in `docs/architecture.md` in the repo. That's Kairos. Thanks for watching.

---

## Recording tips

- **Open every tab in advance** — webhook.site URL, Resend dashboard, admin landing — so you're never waiting on a page load.
- **Pre-seed at least one applicant in the trigger stage minus one** so the webhook demo is a single drag-and-drop.
- **Speak ~30% slower than feels natural** — viewers absorb less than you think.
- **First take is rarely the best.** Plan for two passes: one to find the rhythm, one to record clean.
- **Cut, don't re-take small mistakes.** A 12-min monologue is hard; CapCut or DaVinci Resolve makes editing painless.
- **Audio matters more than video.** Record in a quiet room with a phone or USB mic close to your face.
