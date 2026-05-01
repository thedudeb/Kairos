#!/usr/bin/env bash
# Idempotent bootstrap for a fresh Codespace / clone.
#   - generates matching AUTH_SECRET + INTERNAL_API_KEY in both .env files
#   - waits for Postgres + Redis to be ready
#   - runs alembic migrations
#   - seeds demo data (only if the jobs table is empty)
#
# Safe to re-run; it never overwrites an existing .env.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ bootstrap starting (root: $ROOT)"

# ───────────────────────────────────────────────────────────────────────────
# 1. .env files (generate ONCE, share secrets between frontend + backend)
# ───────────────────────────────────────────────────────────────────────────
if [ ! -f backend/.env ] || [ ! -f frontend/.env.local ]; then
  AUTH_SECRET="$(openssl rand -base64 32 | tr -d '\n')"
  INTERNAL_API_KEY="$(openssl rand -hex 32 | tr -d '\n')"

  if [ ! -f backend/.env ]; then
    echo "→ creating backend/.env"
    sed \
      -e "s|^AUTH_SECRET=.*|AUTH_SECRET=$AUTH_SECRET|" \
      -e "s|^INTERNAL_API_KEY=.*|INTERNAL_API_KEY=$INTERNAL_API_KEY|" \
      -e "s|^INITIAL_ADMIN_EMAIL=.*|INITIAL_ADMIN_EMAIL=demo@kairos.app|" \
      backend/.env.example > backend/.env
  fi

  if [ ! -f frontend/.env.local ]; then
    echo "→ creating frontend/.env.local"
    # Re-derive in case backend/.env already existed
    if [ -f backend/.env ]; then
      AUTH_SECRET="$(grep -E '^AUTH_SECRET=' backend/.env | cut -d= -f2-)"
      INTERNAL_API_KEY="$(grep -E '^INTERNAL_API_KEY=' backend/.env | cut -d= -f2-)"
    fi
    sed \
      -e "s|^AUTH_SECRET=.*|AUTH_SECRET=$AUTH_SECRET|" \
      -e "s|^INTERNAL_API_KEY=.*|INTERNAL_API_KEY=$INTERNAL_API_KEY|" \
      frontend/.env.local.example > frontend/.env.local
  fi
fi

# ───────────────────────────────────────────────────────────────────────────
# 2. Wait for Postgres + Redis (started by docker compose)
# ───────────────────────────────────────────────────────────────────────────
echo "→ waiting for Postgres on localhost:5432…"
for i in $(seq 1 30); do
  if (echo > /dev/tcp/localhost/5432) >/dev/null 2>&1; then
    echo "  Postgres ready"
    break
  fi
  sleep 1
done

echo "→ waiting for Redis on localhost:6379…"
for i in $(seq 1 30); do
  if (echo > /dev/tcp/localhost/6379) >/dev/null 2>&1; then
    echo "  Redis ready"
    break
  fi
  sleep 1
done

# ───────────────────────────────────────────────────────────────────────────
# 3. Migrations
# ───────────────────────────────────────────────────────────────────────────
echo "→ running alembic migrations"
( cd backend && uv run alembic upgrade head )

# ───────────────────────────────────────────────────────────────────────────
# 4. Seed (only if there are zero jobs)
# ───────────────────────────────────────────────────────────────────────────
HAS_JOBS=$(
  cd backend
  uv run python -c "
from app.db import engine
from sqlmodel import Session, select, func
from app.models.job import Job
with Session(engine) as s:
    n = s.execute(select(func.count(Job.id))).scalar() or 0
    print(n)
"
)

if [ "$HAS_JOBS" = "0" ]; then
  echo "→ seeding demo data"
  ( cd backend && uv run python -m scripts.seed )
else
  echo "→ skipping seed (already $HAS_JOBS jobs in DB)"
fi

cat <<'EOF'

✓ Bootstrap complete.

Next steps:
  • Frontend:  cd frontend && pnpm dev
  • Backend:   cd backend && uv run uvicorn app.main:app --reload --port 8000
  • Worker:    cd backend && uv run arq app.worker.WorkerSettings
  • Open:      http://localhost:3000  (click "Try demo" — no Google OAuth needed)

Optional env vars (graceful-degrade when missing):
  GEMINI_API_KEY    — resume parsing + AI fit-score
  RESEND_API_KEY    — confirmation emails
  GCS_BUCKET        — file storage (else local /tmp)
  AUTH_GOOGLE_ID/SECRET — Google sign-in (demo button works without)
EOF
