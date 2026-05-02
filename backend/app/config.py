"""Runtime configuration loaded from environment variables.

A single Settings object is the only thing that reads from os.environ. Every
other module imports `settings` from here so tests can monkeypatch it.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- Required ---------------------------------------------------------
    database_url: str = Field(...)
    redis_url: str = Field(...)
    auth_secret: str = Field(..., min_length=16)
    internal_api_key: str = Field(..., min_length=16)
    initial_admin_email: str = Field(...)
    frontend_origin: str = Field("http://localhost:3000")

    # --- Encryption (separate from auth_secret to allow independent rotation) ---
    # If not set, falls back to auth_secret for backward compatibility.
    encryption_secret: str | None = None

    # --- Optional (filled in on later days) -------------------------------
    gcs_bucket: str | None = None
    google_application_credentials: str | None = None
    resend_api_key: str | None = None
    email_from: str = "Recruiting <hello@example.com>"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-pro"
    gemini_ranking_model: str = "gemini-2.5-flash"

    # --- Behavior ---------------------------------------------------------
    jwt_algorithm: str = "HS256"
    arq_queue_name: str = "recruitment:default"
    environment: str = Field("development")


@lru_cache(maxsize=1)
def _load() -> Settings:
    return Settings()


settings = _load()
