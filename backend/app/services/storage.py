"""File storage abstraction.

Production: Google Cloud Storage with signed URLs.
Local dev (no GCS_BUCKET set): saves to /tmp/recruitment-uploads and
serves files back through a backend endpoint.
"""
from __future__ import annotations

import uuid
from datetime import timedelta
from pathlib import Path

import structlog

from app.config import settings

log = structlog.get_logger()

_LOCAL_DIR = Path("/tmp/recruitment-uploads")


def _ensure_local_dir() -> None:
    _LOCAL_DIR.mkdir(parents=True, exist_ok=True)


def upload_file(
    *,
    data: bytes,
    destination_path: str,
    content_type: str = "application/pdf",
) -> str:
    """Upload bytes to storage and return a storage path.

    Returns:
        - GCS path  ``gs://{bucket}/{destination_path}``  in production
        - Local path ``local://{abs_path}``               in dev
    """
    if settings.gcs_bucket:
        return _upload_gcs(data=data, path=destination_path, content_type=content_type)
    return _upload_local(data=data, path=destination_path)


def _upload_gcs(*, data: bytes, path: str, content_type: str) -> str:
    from google.cloud import storage as gcs

    client = gcs.Client()
    bucket = client.bucket(settings.gcs_bucket)
    blob = bucket.blob(path)
    blob.upload_from_string(data, content_type=content_type)
    gcs_path = f"gs://{settings.gcs_bucket}/{path}"
    log.info("storage.gcs.uploaded", path=gcs_path, size=len(data))
    return gcs_path


def _upload_local(*, data: bytes, path: str) -> str:
    _ensure_local_dir()
    # Flatten any directory separators so we don't need to create subdirs
    safe_name = path.replace("/", "_")
    local_path = _LOCAL_DIR / safe_name
    local_path.write_bytes(data)
    log.info("storage.local.saved", path=str(local_path), size=len(data))
    return f"local://{local_path}"


def read_file_bytes(storage_path: str) -> bytes:
    """Load raw bytes from GCS or local disk (used for authenticated inline viewing)."""
    if storage_path.startswith("local://"):
        local_path = Path(storage_path[len("local://"):])
        if not local_path.is_file():
            raise FileNotFoundError(str(local_path))
        return local_path.read_bytes()

    if storage_path.startswith("gs://"):
        from google.cloud import storage as gcs

        rest = storage_path[5:]
        bucket_name, blob_path = rest.split("/", 1)
        client = gcs.Client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(blob_path)
        return blob.download_as_bytes()

    raise ValueError(f"unsupported storage path scheme: {storage_path[:24]}…")


def get_download_url(storage_path: str, *, frontend_origin: str | None = None) -> str:
    """Return a URL the browser (or external service) can use to download the file.

    - GCS paths  → 1-hour signed URL
    - Local paths → backend /public/files/{filename} endpoint
    """
    if storage_path.startswith("local://"):
        local_path = storage_path[len("local://"):]
        filename = Path(local_path).name
        base = frontend_origin or settings.frontend_origin
        # Point at the FastAPI local-serve endpoint (backend port 8000)
        return f"{base.rstrip('/')}/public/files/{filename}"

    if storage_path.startswith("gs://"):
        try:
            from google.cloud import storage as gcs

            rest = storage_path[5:]
            bucket_name, blob_path = rest.split("/", 1)
            client = gcs.Client()
            bucket = client.bucket(bucket_name)
            blob = bucket.blob(blob_path)
            return blob.generate_signed_url(
                expiration=timedelta(hours=1),
                method="GET",
                version="v4",
            )
        except Exception:
            log.exception("storage.signed_url.failed", path=storage_path)
            return storage_path

    return storage_path


def make_resume_path(job_id: str, applicant_id: str, original_filename: str) -> str:
    """Deterministic GCS/local path for a resume."""
    ext = Path(original_filename).suffix.lower() or ".pdf"
    return f"resumes/{job_id}/{applicant_id}{ext}"
