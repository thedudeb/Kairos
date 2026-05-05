"""URL safety utilities — shared between integration creation and webhook delivery."""
from __future__ import annotations

import ipaddress
import socket

from pydantic import HttpUrl

from app.config import settings


def assert_safe_webhook_url(url: str) -> None:
    """Raise ValueError if *url* resolves to a private/loopback/reserved address.

    Called both at integration create/update time (Pydantic validator) and
    immediately before each outbound HTTP call (prevents DNS-rebinding attacks).

    Private-IP checks apply in ALL environments (not just production) so that
    staging/dev instances cannot be used as SSRF proxies against internal
    infrastructure such as cloud metadata endpoints or local databases.
    HTTPS-only enforcement is still restricted to production to allow local
    development webhooks (e.g. ngrok http:// tunnels).
    """
    parsed = HttpUrl(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Only http and https webhook URLs are allowed.")
    if settings.environment == "production" and parsed.scheme != "https":
        raise ValueError("Webhook URL must use HTTPS.")

    host = (parsed.host or "").strip("[]")

    def _check_addr(addr: ipaddress.IPv4Address | ipaddress.IPv6Address) -> None:
        if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
            raise ValueError(
                f"Webhook URL must not point to a private or reserved address ({addr})."
            )

    try:
        _check_addr(ipaddress.ip_address(host))
    except ValueError as exc:
        if "Webhook URL" in str(exc):
            raise
        # Host is a hostname — resolve it and check every returned IP.
        # DNS failure is treated as unsafe: silently ignoring it would let an
        # attacker configure a host that transiently fails DNS during validation
        # but later resolves to a private/metadata address (DNS-rebinding).
        try:
            results = socket.getaddrinfo(host, None)
            if not results:
                raise ValueError(f"Webhook host '{host}' did not resolve to any address.")
            for *_, sockaddr in results:
                _check_addr(ipaddress.ip_address(sockaddr[0]))
        except (socket.gaierror, OSError) as dns_exc:
            raise ValueError(
                f"Webhook host '{host}' could not be resolved. "
                "Use a publicly reachable hostname."
            ) from dns_exc


def assert_https_document_url(url: str) -> None:
    """Raise ValueError if *url* is not a valid HTTPS URL (public job description link)."""
    try:
        parsed = HttpUrl(url)
    except Exception as exc:
        raise ValueError("Invalid URL.") from exc
    if parsed.scheme != "https":
        raise ValueError("URL must use HTTPS.")
