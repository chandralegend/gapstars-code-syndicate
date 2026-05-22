"""Signed-URL HMAC tokens used for the noVNC viewer/proxy endpoints."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

from app.core.config import get_settings


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def issue(task_id: str, *, ttl_seconds: int | None = None) -> str:
    settings = get_settings()
    ttl = ttl_seconds if ttl_seconds is not None else settings.token_ttl_seconds
    payload = {"task_id": task_id, "exp": int(time.time()) + ttl}
    body = json.dumps(payload, separators=(",", ":")).encode()
    sig = hmac.new(settings.token_secret.encode(), body, hashlib.sha256).digest()
    return f"{_b64encode(body)}.{_b64encode(sig)}"


def verify(token: str, *, expected_task_id: str | None = None) -> dict:
    """Return the decoded payload or raise ValueError on invalid/expired tokens."""
    if not token or "." not in token:
        raise ValueError("malformed token")
    body_b64, sig_b64 = token.split(".", 1)
    try:
        body = _b64decode(body_b64)
        sig = _b64decode(sig_b64)
    except Exception as e:
        raise ValueError("malformed token") from e

    settings = get_settings()
    expected_sig = hmac.new(settings.token_secret.encode(), body, hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expected_sig):
        raise ValueError("invalid signature")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError as e:
        raise ValueError("malformed payload") from e

    if int(payload.get("exp", 0)) < int(time.time()):
        raise ValueError("token expired")

    if expected_task_id is not None and payload.get("task_id") != expected_task_id:
        raise ValueError("token does not match task id")

    return payload
