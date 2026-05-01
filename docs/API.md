# HTTP API notes

The canonical interactive documentation is the OpenAPI UI served by FastAPI:

- **Local:** http://localhost:8000/docs
- **Deployed:** `{BACKEND_URL}/docs`

This file summarizes **staff- and admin-only** endpoints added or emphasized for team management and assignment alignment. All of these require an `Authorization: Bearer <jwt>` header from a signed-in user (issued via `/internal/auth/sync` during Google OAuth).

## Roles

- **Reviewer** — read-only on job workspace data (list/detail applicants, analytics, pipeline board view, integrations list + delivery log read, template/job reads, etc.). Mutations return **403** unless noted.
- **Admin** — full access including invites, job publish/close, form builder writes, pipeline stage CRUD, CSV export, integration CRUD, and applicant mutations (stage move, notes, re-parse, corrections).

## Team / users (`/users`)

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/users` | Admin | List all staff users (`StaffUserOut`). |
| `GET` | `/users/invites/pending` | Admin | List pending email invites. |
| `POST` | `/users/invites` | Admin | Body: `{ "email": "...", "role": "admin" \| "reviewer" }`. Creates invite (201). Conflict if user exists or invite pending. |
| `DELETE` | `/users/invites/{invite_id}` | Admin | Revoke a pending invite (204). |
| `PATCH` | `/users/{user_id}/role` | Admin | Body: `{ "role": "admin" \| "reviewer" }`. Promote/demote. Returns 400 if demoting the last admin. |

On first Google sign-in, if the normalized email matches a row in `user_invites`, the new user receives that **role** and the invite is consumed (see internal sync handler).

## Related product behaviors

- **Job description:** Jobs may use `description_kind` `markdown` or `external`, with optional `description_external_url` (HTTPS) and `description_summary`. Public job pages and admin settings expose these fields.
- **File fields:** Custom form fields may set `file_allowed_types` (e.g. `["application/pdf"]`); public apply validates uploads per field.
- **Export:** CSV export under `/export` (or proxied routes) remains **admin-only** so reviewers cannot exfiltrate bulk data.

For full path lists, request bodies, and schemas, use **`/docs`** above.
