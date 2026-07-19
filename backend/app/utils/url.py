"""URL safety utilities — shared between integration creation and webhook delivery."""
from __future__ import annotations

import http.client
import ipaddress
import json
import socket
import ssl
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

from pydantic import HttpUrl

from app.config import settings


def _resolve_safe_webhook_url(url: str) -> tuple[HttpUrl, list[str]]:
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
    if parsed.username or parsed.password:
        raise ValueError("Webhook URLs must not contain credentials.")

    def _check_addr(addr: ipaddress.IPv4Address | ipaddress.IPv6Address) -> None:
        if not addr.is_global:
            raise ValueError(
                f"Webhook URL must not point to a private or reserved address ({addr})."
            )

    try:
        literal = ipaddress.ip_address(host)
        _check_addr(literal)
        return parsed, [str(literal)]
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
            addresses: list[str] = []
            for *_, sockaddr in results:
                addr = ipaddress.ip_address(sockaddr[0])
                _check_addr(addr)
                normalized = str(addr)
                if normalized not in addresses:
                    addresses.append(normalized)
            return parsed, addresses
        except (socket.gaierror, OSError) as dns_exc:
            raise ValueError(
                f"Webhook host '{host}' could not be resolved. "
                "Use a publicly reachable hostname."
            ) from dns_exc


def assert_safe_webhook_url(url: str) -> None:
    _resolve_safe_webhook_url(url)


@dataclass(frozen=True)
class SafeWebhookResponse:
    status_code: int
    text: str


class _PinnedHTTPSConnection(http.client.HTTPConnection):
    """TLS connection pinned to a validated IP while authenticating the hostname."""

    def __init__(self, ip: str, port: int, hostname: str, timeout: float):
        super().__init__(ip, port=port, timeout=timeout)
        self._hostname = hostname

    def connect(self) -> None:
        raw = socket.create_connection(
            (self.host, self.port), self.timeout, self.source_address
        )
        self.sock = ssl.create_default_context().wrap_socket(
            raw, server_hostname=self._hostname
        )


def post_safe_webhook(
    url: str,
    *,
    payload: dict[str, Any],
    headers: dict[str, str],
    timeout: float,
) -> SafeWebhookResponse:
    """POST using the same public IP that passed validation.

    HTTPS verifies the certificate and SNI against the original hostname.
    Redirects are deliberately not followed.
    """
    parsed, addresses = _resolve_safe_webhook_url(url)
    hostname = (parsed.host or "").strip("[]")
    split = urlsplit(str(parsed))
    default_port = 443 if parsed.scheme == "https" else 80
    port = split.port or default_port
    ip = addresses[0]
    host_header = f"[{hostname}]" if ":" in hostname else hostname
    if port != default_port:
        host_header = f"{host_header}:{port}"

    connection: http.client.HTTPConnection
    if parsed.scheme == "https":
        connection = _PinnedHTTPSConnection(ip, port, hostname, timeout)
    else:
        connection = http.client.HTTPConnection(ip, port=port, timeout=timeout)

    path = split.path or "/"
    if split.query:
        path += f"?{split.query}"
    body = json.dumps(payload, separators=(",", ":")).encode()
    request_headers = {
        **headers,
        "Host": host_header,
        "Content-Type": "application/json",
        "Content-Length": str(len(body)),
    }
    try:
        connection.request("POST", path, body=body, headers=request_headers)
        response = connection.getresponse()
        raw = response.read(64 * 1024 + 1)[: 64 * 1024]
        charset = response.headers.get_content_charset() or "utf-8"
        return SafeWebhookResponse(
            status_code=response.status,
            text=raw.decode(charset, errors="replace"),
        )
    finally:
        connection.close()


def assert_https_document_url(url: str) -> None:
    """Raise ValueError if *url* is not a valid HTTPS URL (public job description link)."""
    try:
        parsed = HttpUrl(url)
    except Exception as exc:
        raise ValueError("Invalid URL.") from exc
    if parsed.scheme != "https":
        raise ValueError("URL must use HTTPS.")
