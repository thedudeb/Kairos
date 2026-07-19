from __future__ import annotations

from app.config import settings


def _sync(client, email: str):
    return client.post(
        "/internal/auth/sync",
        json={"email": email, "name": "Security Test"},
        headers={"X-Internal-API-Key": settings.internal_api_key},
    )


def test_demo_admin_is_disabled_by_default(client):
    old = settings.demo_enabled
    settings.demo_enabled = False
    try:
        response = _sync(client, "demo@kairos.app")
    finally:
        settings.demo_enabled = old
    assert response.status_code == 403


def test_arbitrary_first_user_cannot_become_admin(client):
    response = _sync(client, "attacker@example.com")
    assert response.status_code == 403


def test_configured_bootstrap_admin_can_sign_in(client):
    response = _sync(client, settings.initial_admin_email)
    assert response.status_code == 200
    assert response.json()["user"]["role"] == "admin"


def test_demo_admin_requires_explicit_server_flag(client):
    old = settings.demo_enabled
    settings.demo_enabled = True
    try:
        response = _sync(client, "demo@kairos.app")
    finally:
        settings.demo_enabled = old
    assert response.status_code == 200
    assert response.json()["user"]["role"] == "admin"
