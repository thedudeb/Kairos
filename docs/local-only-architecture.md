# Local-only architecture

Kairos now has a hard runtime boundary around external compute:

```text
Browser -> Next.js -> FastAPI -> PostgreSQL
                         |----> local filesystem
                         |----> Redis/ARQ worker
                                  |----> pdfplumber
                                  |----> local parser
                                  |----> local match scorer
```

No component imports a Google Cloud or generative-AI SDK. The only optional
outbound services are administrator-configured webhooks, Google OAuth for
sign-in, and Resend for email.

Resume parsing and scoring run in the ARQ worker but are deterministic and make
no network requests. Uploaded files use `LOCAL_UPLOAD_DIR`; production-like
local deployments should mount that directory on a persistent volume.

Legacy `gs://` records are never resolved or downloaded. This guarantees that
opening an old applicant record cannot silently incur cloud API usage.
