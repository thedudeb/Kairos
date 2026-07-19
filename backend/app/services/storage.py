"""Local filesystem storage with no cloud provider or network fallback."""
from __future__ import annotations

from pathlib import Path

import structlog

from app.config import settings

log = structlog.get_logger()

_LOCAL_DIR = Path(settings.local_upload_dir).expanduser().resolve()


def _ensure_local_dir() -> None:
    _LOCAL_DIR.mkdir(parents=True, exist_ok=True)


def upload_file(
    *,
    data: bytes,
    destination_path: str,
    content_type: str = "application/pdf",
) -> str:
    """Save bytes locally and return a ``local://`` storage path."""
    return _upload_local(data=data, path=destination_path)


def _upload_local(*, data: bytes, path: str) -> str:
    _ensure_local_dir()
    # Flatten any directory separators so we don't need to create subdirs
    safe_name = path.replace("/", "_")
    local_path = _LOCAL_DIR / safe_name
    local_path.write_bytes(data)
    log.info("storage.local.saved", path=str(local_path), size=len(data))
    return f"local://{local_path}"


def read_file_bytes(storage_path: str) -> bytes:
    """Load local bytes without falling back to a cloud provider."""
    if storage_path.startswith("local://"):
        local_path = Path(storage_path[len("local://"):])
        if not local_path.is_file():
            raise FileNotFoundError(str(local_path))
        return local_path.read_bytes()

    if storage_path.startswith("gs://"):
        raise FileNotFoundError(
            "Legacy Google Cloud object unavailable: cloud storage is disabled."
        )

    raise ValueError(f"unsupported storage path scheme: {storage_path[:24]}…")


def get_download_url(storage_path: str, *, frontend_origin: str | None = None) -> str:
    """Return the backend URL for a locally stored file."""
    if storage_path.startswith("local://"):
        local_path = storage_path[len("local://"):]
        filename = Path(local_path).name
        base = frontend_origin or settings.frontend_origin
        # Point at the FastAPI local-serve endpoint (backend port 8000)
        return f"{base.rstrip('/')}/public/files/{filename}"

    if storage_path.startswith("gs://"):
        return ""

    return storage_path


def make_resume_path(job_id: str, applicant_id: str, original_filename: str) -> str:
    """Deterministic local path for a resume.

    The public upload endpoint only accepts PDF files, so we always store
    with a .pdf extension regardless of what the client sent in the filename.
    This closes a path-traversal / extension-smuggling vector.
    """
    return f"resumes/{job_id}/{applicant_id}.pdf"
