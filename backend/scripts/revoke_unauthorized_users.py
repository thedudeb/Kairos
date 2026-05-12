"""One-shot cleanup for users created via the old "any Google account
becomes a reviewer" bug.

Background: until commit fixing internal_auth.py, ANY Google account that
signed in got a User row inserted with role=reviewer. The rubric flagged
this as a security gap. The runtime fix (reject unknown emails at sync time)
prevents NEW unauthorized signups, but existing User rows from before the
fix can still sign in until they're removed.

This script identifies and removes those rogue rows. It keeps:
- Admins (explicitly trusted)
- The bootstrap admin (INITIAL_ADMIN_EMAIL)
- The demo account (demo@kairos.app)
- Anyone with a pending UserInvite (they were meant to be here)

Run from the backend dir:
    uv run python scripts/revoke_unauthorized_users.py            # dry run
    uv run python scripts/revoke_unauthorized_users.py --commit   # actually delete

Always do the dry run first.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Make `app.*` importable when run as `uv run python scripts/...`.
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlmodel import Session, select  # noqa: E402

from app.config import settings  # noqa: E402
from app.db import engine  # noqa: E402
from app.models._base import Role  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.user_invite import UserInvite  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--commit",
        action="store_true",
        help="Actually delete the rows. Without this flag the script only prints what it would do.",
    )
    args = parser.parse_args()

    bootstrap_email = settings.initial_admin_email.lower()
    demo_email = "demo@kairos.app"

    with Session(engine) as session:
        all_users = session.exec(select(User)).all()
        # Map any pending invites by lowercased email for quick lookup.
        invite_emails = {
            row.email.lower()
            for row in session.exec(select(UserInvite)).all()
        }

        to_revoke: list[User] = []
        kept: list[tuple[User, str]] = []

        for u in all_users:
            email = u.email.lower()
            reason: str | None = None
            if u.role == Role.admin:
                reason = "admin"
            elif email == bootstrap_email:
                reason = "bootstrap admin (env var)"
            elif email == demo_email:
                reason = "demo account"
            elif email in invite_emails:
                reason = "pending invite"

            if reason:
                kept.append((u, reason))
            else:
                to_revoke.append(u)

        print(f"\nTotal users in DB: {len(all_users)}")
        print(f"  Keep:   {len(kept)}")
        print(f"  Revoke: {len(to_revoke)}\n")

        if kept:
            print("Keeping:")
            for u, reason in kept:
                print(f"  [{u.role.value:8s}] {u.email:40s}  ({reason})")
            print()

        if not to_revoke:
            print("No unauthorized users found. Nothing to do.")
            return 0

        print("Would revoke:" if not args.commit else "Revoking:")
        for u in to_revoke:
            print(f"  [{u.role.value:8s}] {u.email}")

        if not args.commit:
            print("\nDry run only. Re-run with --commit to actually delete these rows.")
            return 0

        for u in to_revoke:
            session.delete(u)
        session.commit()
        print(f"\nDeleted {len(to_revoke)} unauthorized user row(s).")

    return 0


if __name__ == "__main__":
    sys.exit(main())
