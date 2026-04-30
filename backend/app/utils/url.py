"""URL safety utilities — shared between integration creation and webhook delivery."""
from __future__ import annotations

import ipaddress
import socket

from pydantic import HttpUrl


def assert_safe_webhook_url(url: str) -> None:
    """Raise ValueError if *url* resolves to a private/loopback/reserved address.

    Called both at integration create/update time (Pydantic validator) and
    immediately before each outbound HTTP call (prevents DNS-rebinding attacks).
    """
    parsed = HttpUrl(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Only http and https webhook URLs are allowed.")
    host = (parsed.host or "").strip("[]")

    try:
        addr = ipaddress.ip_address(host)
        if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
            raise ValueError("Webhook URL must not point to a private or reserved address.")
    except ValueError as exc:
        if "Webhook URL" in str(exc):
            raise
        # Host is a name — resolve it and check every returned IP.
        try:
            results = socket.getaddrinfo(host, None)
            for *_, sockaddr in results:
                addr = ipaddress.ip_address(sockaddr[0])
                if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
                    raise ValueError(
                        f"Webhook URL resolves to a private or reserved address ({sockaddr[0]})."
                    )
        except (socket.gaierror, OSError):
            pass  # DNS failure is handled at delivery time
