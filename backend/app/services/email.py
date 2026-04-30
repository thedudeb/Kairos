"""Email delivery via Resend.

If RESEND_API_KEY is not configured the email is logged to stdout instead
so the local dev flow works without a real email provider.
"""
from __future__ import annotations

import html as html_lib
import structlog

from app.config import settings

log = structlog.get_logger()

_CONFIRMATION_HTML = """
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:system-ui,-apple-system,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 20px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #e5e7eb;padding:40px;max-width:600px">
        <tr>
          <td style="padding-bottom:24px;border-bottom:1px solid #f3f4f6">
            <p style="margin:0;font-size:13px;color:#6b7280;font-weight:600;letter-spacing:.08em;text-transform:uppercase">Application received</p>
          </td>
        </tr>
        <tr>
          <td style="padding-top:24px">
            <p style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827">Hi {applicant_name},</p>
            <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6">
              Thank you for applying for the <strong>{job_title}</strong> position.
              We've received your application and our team will be in touch.
            </p>
            <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6">
              You don't need to do anything right now. If we'd like to move
              forward we'll reach out directly to <strong>{email}</strong>.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""


def send_application_confirmation(
    *,
    to: str,
    applicant_name: str,
    job_title: str,
) -> None:
    """Send the application confirmation email.

    Silently logs if RESEND_API_KEY is not set (local dev mode).
    Logs a warning (but does not raise) if delivery fails so the
    submission still completes.
    """
    if not settings.resend_api_key:
        log.warning(
            "email.skipped.no_api_key",
            to=to,
            job_title=job_title,
            note="Set RESEND_API_KEY to enable real email delivery",
        )
        return

    try:
        import resend as resend_sdk

        resend_sdk.api_key = settings.resend_api_key
        html = _CONFIRMATION_HTML.format(
            applicant_name=html_lib.escape(applicant_name),
            job_title=html_lib.escape(job_title),
            email=html_lib.escape(to),
        )
        resend_sdk.Emails.send(
            {
                "from": settings.email_from,
                "to": [to],
                "subject": f"Application received — {job_title}",
                "html": html,
            }
        )
        log.info("email.sent", to=to, job_title=job_title)
    except Exception:
        log.exception("email.delivery_failed", to=to, job_title=job_title)
