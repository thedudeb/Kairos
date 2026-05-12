# Pre-Submission Verification Checklist

**Purpose:** Walk through this file in a clean Chrome incognito window against the deployed production URL before any take-home submission, demo, or formal review. Each item maps directly to a rubric line item from the original assessment. Catches what *"oh I'll test it later"* always misses.

**Why this exists:** Original submission scored 7.1/10 with the reviewer's note: *"did not test the app thoroughly before submitting."* This is the testing pass that would have prevented that.

**The protocol:**

1. Open Chrome → File → New Incognito Window (Cmd+Shift+N)
2. Disable any extensions allowed in incognito (`chrome://extensions` → for each, toggle off "Allow in Incognito")
3. Open the deployed URL fresh
4. Walk through every section below
5. Mark each item ✅ pass / ❌ fail / ⚠️ flaky
6. **Do not submit until every item is ✅ or has a documented exception**

Where the rubric scored 1 or 0, the explicit fix is referenced so you know what behavior to expect now.

---

## Section 1 — Deliverables & Setup

### 1.1 Deployed app loads

- [ ] Hit the deployed URL — landing page renders without console errors
- [ ] `/careers` index page renders (rubric: docs/spec contradiction, we built the index)
- [ ] Pick any `/careers/[slug]` — job page renders with title, description, application form
- [ ] `/admin` page either redirects to sign-in (if not authed) or shows the job list (if authed)

**Expected:** No 500s, no blank pages, no broken images.

### 1.2 README check

- [ ] `README.md` references the deployed URL accurately
- [ ] `backend/.env.example` lists every required env var (`PUBLIC_API_URL` was added tonight — verify it's there)
- [ ] `docs/architecture.md` mentions the snapshot-vs-linked template decision
- [ ] No references to commits or features that no longer exist

---

## Section 2 — Public Application Portal

### 2.1 Job page rendering (rubric #3, was 2)

- [ ] Visit `/careers/[some-active-job]`
- [ ] Full job title visible
- [ ] Full description renders correctly (markdown bullets, headings render)
- [ ] All custom form fields appear in the order configured by the admin
- [ ] **`noindex` header present** — open devtools Network tab, look at the page response, confirm `X-Robots-Tag: noindex, nofollow` is in the headers

### 2.2 Form validation (rubric #4, was 0 — fixed tonight)

Required field tests — submit with each empty, expect inline error:

- [ ] Empty first name → required
- [ ] Empty last name → required
- [ ] Empty email → *"Email address is required."*
- [ ] Empty phone → *"Phone number is required."*
- [ ] No resume → required

Format validation tests:

- [ ] Email = `abc` → *"Please enter a valid email address (e.g. you@example.com)."*
- [ ] Email = `foo bar@baz.com` → *"Email address can't contain spaces."*
- [ ] Phone = `abc` → *"Phone number can only contain digits, spaces, +, -, ( ) and dots."*
- [ ] Phone = `12` → *"Phone number is too short."*
- [ ] Resume = a `.txt` file → *"Only PDF files are accepted..."*
- [ ] Resume = an 11MB PDF → *"Resume file must be under 10 MB."*

Backend error surfacing:

- [ ] Submit a valid application with a fresh email → success message + applicant created in admin
- [ ] Submit AGAIN with the same email to the same job → real backend message: *"An application with this email already exists for this position."* (NOT *"Something went wrong"*)
- [ ] Submit same email to a *different* job → succeeds

### 2.3 Submission edge cases (rubric #5, was 2)

- [ ] Open the URL of a job set to "Closed" → *"This position is no longer accepting applications"* page

### 2.4 Confirmation email (rubric requires)

- [ ] Submit an application with an email address you control
- [ ] Check that inbox within 60s — confirmation email should arrive
- [ ] Email contains: applicant name, job title, confirmation language

---

## Section 3 — Job Management & Form Builder

### 3.1 Job creation (rubric #6, was 2)

- [ ] Admin → "Create new job"
- [ ] Title field works, slug auto-generates from title, slug is editable
- [ ] Save → newly-created job has status `Draft` by default
- [ ] Visit `/careers/[slug-of-draft-job]` → 404 or "not found" (drafts shouldn't be publicly reachable)

### 3.2 Status transitions (rubric #7, was 2)

- [ ] Move Draft → Active. Public page now reachable.
- [ ] Move Active → Closed. Public page now shows "no longer accepting applications" panel.

### 3.3 Custom field builder (rubric #8, was 1 — fixed tonight)

- [ ] Add a text field, label = "LinkedIn URL", save → renders on public form
- [ ] Add a dropdown field with options "A, B, C", save → renders as `<select>` with those options
- [ ] Try saving a field with **empty label** → red border + "Required" helper text + toast on save *"Custom field #N needs a label"* — does NOT save
- [ ] Add a dropdown field with **no options** → red border + "At least one option is required for dropdown fields" — does NOT save
- [ ] Drag-and-drop reorder fields → order persists after page refresh
- [ ] Delete a field → field is gone after refresh (does not reappear)

### 3.4 Field changes propagate to public form

- [ ] Add a new field, save
- [ ] Open `/careers/[slug]` in another tab → new field is visible

---

## Section 4 — Templates

### 4.1 Template CRUD (rubric #9, was 1 — fixed tonight)

- [ ] Admin → Templates → "New template"
- [ ] Template starts with **4 default assessment questions** (rubric explicit requirement)
- [ ] Save with empty template name → blocked (existing)
- [ ] Save with a question that has **empty text** → red border on the question + toast *"Assessment question #N needs question text"* — does NOT save
- [ ] Click **Delete** on a template → actually deletes (does not silent-fail like before)
- [ ] Duplicate template → creates a copy with name suffix or similar
- [ ] Preview a template → shows both form fields AND assessment question list

### 4.2 Apply template to existing job (rubric #10, was 1 — fixed tonight)

- [ ] Pick a job that already has applicants (any seeded job qualifies)
- [ ] Apply a template to it → **succeeds without 500 error** (this was the rubric-flagged FK violation; cascade-delete now handles it)
- [ ] Custom form fields on the job now match the template
- [ ] Job's assessment questions now match the template
- [ ] Can still edit fields directly on the job after applying

### 4.3 Save questions on a job with applicants

- [ ] Go to that same job's Settings → Assessment questions tab
- [ ] Edit a question, click Save → **succeeds without 500** (the form-fields-getting-rewritten bug is fixed)
- [ ] The job's form fields are unchanged after saving questions

---

## Section 5 — Resume Parsing ★ CENTERPIECE ×2 weight

### 5.1 Parsing reliability (rubric #11, was 0 — fixed tonight)

**The test set** (PDFs in `test-resumes/`):

| Resume | Expected outcome |
|---|---|
| `resume-1-standard.pdf` (Avery Chen) | ✅ Parsed, all fields populated |
| `resume-2-multipage.pdf` (Priya Ramanthan) | ✅ Parsed, multi-page handled, multiple education + work entries captured |
| `resume-3-designer.pdf` (Marcus Webb) | ✅ Parsed, two-column layout extracted |
| `resume-4-image-only.pdf` (Daniela Ortiz) | ❌ Failed cleanly with: *"This PDF appears to contain only images..."* |
| `resume-5-minimal.pdf` (Jordan Pike) | ✅ Parsed, low-confidence on missing fields |
| `resume-6-international.pdf` (Minjun Kim) | ✅ Parsed, Korean + French characters handled |

- [ ] All six results match the table above
- [ ] **Re-parse button is visible** for failed applicants
- [ ] Clicking Re-parse on the image-only one → fails again with the same message (confirming the error class is consistent)

### 5.2 Parse failure handling (rubric #13, was 1 — fixed tonight)

- [ ] Submit a resume, then immediately load the applicant detail page
- [ ] Status badge starts as `Pending`, transitions to `Parsing`, then `Parsed` (or `Failed`)
- [ ] Status updates **without manual refresh** (the poller fires every 4s)
- [ ] If a parse fails, the error message is the friendly user-facing one (NOT a Python stack trace)
- [ ] If status is `pending` for > 2 minutes → amber warning panel appears: *"Parsing hasn't started. The background worker may be unavailable..."*

### 5.3 Manual edit (rubric requires)

- [ ] On a successfully-parsed applicant, click **Edit** in the resume intelligence section
- [ ] Modify a field (e.g. correct the institution name), save → change persists

### 5.4 Original PDF always accessible

- [ ] On every applicant (parsed AND failed), the **original resume viewer** still shows the PDF
- [ ] On the image-only failed applicant, the viewer still works (you can see the PDF — just no parsed data)

---

## Section 6 — Admin Dashboard

### 6.1 Job selection landing (rubric #14, was 2)

- [ ] `/admin` shows all jobs grouped by status (Active / Draft / Closed)
- [ ] Each job card shows: total applicants, new this week, stage distribution bars
- [ ] "Create new job" is accessible from this page

### 6.2 Per-job metrics (rubric #15, was 2)

- [ ] Open any job → Overview tab
- [ ] Numbers match what you'd expect (sanity-check against the applicant list count)

### 6.3 Visualizations (rubric #16, was 2)

- [ ] Application volume chart renders, can be filtered by date range
- [ ] Institution distribution chart renders
- [ ] Degree program chart renders
- [ ] Charts respond to the date filter

---

## Section 7 — Applicant List & Detail ★ CENTERPIECE ×2 weight

### 7.1 Sorting & filtering (rubric #17, was 1 — fixed tonight)

- [ ] Sort by date / name / institution / degree / stage — each works
- [ ] Click "Filters" → filter by institution, save
- [ ] Click an individual stage pill → **all OTHER stage pills still show their correct counts** (not 0)
- [ ] Stack filters (institution + skill) → applicant list shows the intersection
- [ ] "Clear all filters" button works

### 7.2 Grouping & search (rubric #18, was 2)

- [ ] Group by institution → applicants grouped under their school
- [ ] Group by degree → applicants grouped under their degree
- [ ] Search "John" (or any name fragment) → finds applicants whose name/email matches
- [ ] Search a skill term → finds applicants whose parsed skills include that
- [ ] Search response time feels under 1 second

### 7.3 Detail view (rubric #20, was 1 — fixed tonight)

- [ ] Click an applicant → detail page loads
- [ ] **Resume PDF renders inside the iframe** — no "Resume could not be displayed" on a freshly-applied applicant
- [ ] No `sendWithPromise` errors in browser console
- [ ] Parsed data section shows skills, education, work history
- [ ] Custom field values from the application are shown
- [ ] AI fit score panel shows a number + per-dimension bars
- [ ] Activity timeline shows: Application submitted → (any stage transitions)
- [ ] Notes section: Add a note → saves with timestamp → Edit → Delete works

### 7.4 PDF viewer doesn't break on missing files

- [ ] Find a seeded applicant whose resume file isn't on production storage (any with a `local://` path from the seed script)
- [ ] PDF area shows the iframe (which may be blank inside) — the page **does not crash**

---

## Section 8 — Hiring Pipeline ★ CENTERPIECE ×2 weight

### 8.1 Configurable stages (rubric #21, was 1 — fixed tonight)

- [ ] Pipeline tab → all stages visible as columns
- [ ] Rename a stage → name updates, persists across refresh
- [ ] Drag-reorder columns → order persists across refresh
- [ ] Delete an empty stage → **stays deleted after refresh** (this was the rubric's specific complaint)
- [ ] Try to delete a stage with applicants → red banner: *"Cannot delete stage: N applicant(s) are currently in it..."* — UI doesn't lie about success
- [ ] Try to delete the last remaining stage → blocked

### 8.2 Kanban drag-and-drop (rubric #22, was 2)

- [ ] Drag an applicant card from one column to another → moves
- [ ] Refresh → applicant is in the new stage (didn't bounce back)
- [ ] Drag the same applicant up/down within a column → reorders (client-side only — refresh resets to default)

### 8.3 Stage transition logging (rubric #23, was 2)

- [ ] Move an applicant → open their detail page → activity timeline shows: "Moved from X to Y" with timestamp + admin user name

---

## Section 9 — External Service Integration

### 9.1 Integration configuration (rubric #24, was 2)

- [ ] Pick a job → Integrations tab → "Add integration"
- [ ] Configure: pipeline stage, destination URL (use `https://webhook.site/`), bearer key, "include assessment" toggle, active toggle
- [ ] Save → integration appears in the list

### 9.2 Outbound API correctness (rubric #25, was 1 — fixed tonight)

- [ ] Set the destination URL to a fresh **webhook.site** URL
- [ ] Move an applicant into the configured stage
- [ ] Check webhook.site within ~10s — request arrives
- [ ] Headers include: `Content-Type: application/json`, `Authorization: Bearer <key>`
- [ ] Payload structure:
  - `event`: "stage_transition"
  - `timestamp`: ISO 8601
  - `candidate`: { id, name, email, phone, resumeUrl }
  - `stage`: { id, name }
  - `job`: { id, title, slug }
  - `assessment`: { title, questions: [...] } (only if integration's "include assessment" is on AND the job has a template applied)
- [ ] **Open the `candidate.resumeUrl` in a new tab** → PDF downloads/displays (NOT 401, NOT 404, NOT a gs:// URL)
- [ ] Open it again 65 minutes later → expired with 401 (token TTL is 1 hour by design)

### 9.3 Integration dashboard, retry & dedup (rubric #26, was 1 — fixed tonight)

- [ ] On the integration row, click expand
- [ ] **Delivery log shows the actual deliveries** (NOT "No deliveries yet" when there clearly are some)
- [ ] Failed deliveries count matches what you see in the log
- [ ] Click "Test" → fires a sample payload, shows result
- [ ] Stage transitions still complete even when the webhook URL is broken — the pipeline doesn't block on webhook failure

---

## Section 10 — Authentication

### 10.1 OAuth + bootstrap (rubric #27, was 1 — fixed tonight)

- [ ] Sign out
- [ ] Sign in with the bootstrap admin Google account (the email in `INITIAL_ADMIN_EMAIL`) → succeeds, admin role
- [ ] Sign out
- [ ] Sign in with a **different** Google account → **rejected, red banner on sign-in page**: *"This account isn't authorized to access this workspace. Ask an existing admin to invite you."*
- [ ] Sign out, click "Try demo" → demo account works, lands in admin dashboard

### 10.2 Sessions

- [ ] Sign in, close browser, reopen → still signed in (httpOnly cookie persists)
- [ ] Public `/careers/...` routes are accessible without signing in

---

## Section 11 — UX Polish (rubric #28, was 1 — fixed tonight)

### 11.1 Cursor

- [ ] Hover over any button anywhere → cursor changes to pointer (NOT default arrow)
- [ ] Hover over the calendar icon in a date input → pointer
- [ ] Hover over a disabled button → stays default cursor (so it looks disabled)

### 11.2 Filter UI

- [ ] Open filter panel → active skill chips use indigo (not the old off-brand blue)
- [ ] "Apply filters" button looks prominent; "Clear all" looks like a clearly-clickable bordered button

### 11.3 Loading states

- [ ] Click around fast — no layout shift when data loads
- [ ] Empty applicant list shows an empty state, not a blank screen

---

## Section 12 — Mobile (rubric #30, was 1 — fixed tonight)

### 12.1 Viewport (the core fix)

- [ ] DevTools → toggle device mode → set width to 375px (iPhone)
- [ ] Reload the page → content is at correct size (NOT a tiny shrunken desktop)
- [ ] Source → look at the page → `<meta name="viewport" content="width=device-width...">` is present

### 12.2 Public form on phone-sized viewport

- [ ] Open `/careers/[slug]` at 375px width
- [ ] First/Last name fields stack vertically (don't side-by-side overflow)
- [ ] All form inputs are tappable (large enough touch targets)
- [ ] Submit button is full-width

### 12.3 Admin on phone

- [ ] `/admin` is readable at 375px
- [ ] Applicant list horizontally scrolls if needed
- [ ] Job nav tabs scroll horizontally
- [ ] Kanban board: each column is one screen-width — horizontal scroll between stages

---

## Section 13 — Engineering Quality (rubric #29, was 1)

This is the meta-rubric. If everything above passes, this almost certainly improves.

- [ ] No console errors anywhere during the walkthrough
- [ ] No 500s in any Network tab while clicking around
- [ ] All flows complete or fail with a clear error message — no silent dead-ends
- [ ] Performance feels responsive at the seeded scale

---

## Pre-Submission Final Checks

Before pushing the URL to a reviewer or submitting any take-home, run this trio:

- [ ] **All sections above are ✅ on the deployed URL in clean incognito**
- [ ] **Production DB cleanup done**: `revoke_unauthorized_users.py --commit` was run against prod once after the auth lockdown shipped, removing any rogue reviewer accounts created by the old bug
- [ ] **PUBLIC_API_URL env var is set** on the `recruitment-api` Cloud Run service (otherwise #25 webhook URLs are broken)
- [ ] **GitHub Cloud Build trigger is active** (`deploy-on-main`) — confirms latest code is what's deployed
- [ ] **Frontend deploy on Vercel is on the same commit** as the backend (both auto-deploy on push to main, but worth a sanity check)

---

## What scored what (running tally)

Tonight's work shipped fixes for these rubric items. Sourced from the actual rubric notes received with the original 7.1/10 score.

| Rubric Item | Was | Targeted After Tonight | Notes |
|---|---|---|---|
| #4 Form validation & submission | 0 | 2-3 | Phone + email + Pydantic error surfacing |
| #8 Custom field builder | 1 | 2 | Empty labels + dropdown options rejected |
| #9 Template CRUD & preview | 1 | 2 | Empty question text rejected, delete works |
| #10 Apply template to job | 1 | 2-3 | FK cascade fix; same-half-only update |
| #11 Parsing accuracy ★×2 | 0 | 2-3 | Typed errors, retry, 5/6 success on test set |
| #13 Parse failure handling ★×2 | 1 | 2-3 | Stuck-pending detection, always-available re-parse, friendly messages |
| #17 Sorting & filtering ★×2 | 1 | 2 | Stage pill counts respect non-stage filters |
| #20 Detail view ★×2 | 1 | 2-3 | Native iframe viewer, sidebar hidden |
| #21 Configurable stages ★×2 | 1 | 2-3 | Real errors surfaced, optimistic UI reverts |
| #25 Outbound API correctness | 1 | 2-3 | Token-signed externally-reachable resume URL |
| #26 Integration dashboard | 1 | 2 | Server action for listing deliveries |
| #27 Auth + first-admin bootstrap | 1 | 2-3 | Unknown accounts rejected, clear UI error |
| #28 Visual polish | 1 | 2 | Global cursor:pointer, filter UI, native control cursors |
| #30 Mobile responsiveness | 1 | 2 | Viewport meta added |

If reviewers credit even ~80% of these as 2s, the score moves from 57/86 (7.1) to roughly 70/86 (8.1). With some 3s, higher.

---

*Last updated: 2026-05-12. Update this file whenever a new code change should change the verification protocol.*
