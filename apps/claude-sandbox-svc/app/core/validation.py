"""Validation helpers for user-supplied task input."""

from __future__ import annotations

import re

# Block obvious secret-bearing names from being injected unless the operator
# explicitly opts in (env names starting with TASK_ are always allowed).
_BLOCKED_PATTERNS = [
    re.compile(r".*(KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL).*", re.IGNORECASE),
    re.compile(r"^(ANTHROPIC_|AWS_|GOOGLE_|GCP_|OPENAI_).*"),
]
_ALLOW_PREFIX = "TASK_"


class EnvValidationError(ValueError):
    pass


def validate_user_env(env: dict[str, str]) -> dict[str, str]:
    """Return a sanitized env mapping or raise EnvValidationError.

    Rules:
    - Names must match [A-Za-z_][A-Za-z0-9_]*.
    - Names with a TASK_ prefix are always allowed (this is the recommended
      convention for user-supplied data).
    - Other names matching obvious secret-related patterns are rejected.
    - All values are coerced to str.
    """
    if not env:
        return {}

    result: dict[str, str] = {}
    for raw_name, raw_value in env.items():
        name = str(raw_name)
        if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", name):
            raise EnvValidationError(f"invalid env var name: {name!r}")
        if name.startswith(_ALLOW_PREFIX):
            result[name] = str(raw_value)
            continue
        if any(p.match(name) for p in _BLOCKED_PATTERNS):
            raise EnvValidationError(
                f"env var {name!r} looks sensitive; rename with TASK_ prefix to opt in"
            )
        result[name] = str(raw_value)
    return result


_REDACT_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9_\-]{10,}"),
    re.compile(r"Bearer\s+[A-Za-z0-9_\-\.]+", re.IGNORECASE),
    re.compile(r"x-api-key\s*[:=]\s*\S+", re.IGNORECASE),
]


def redact_text(text: str) -> str:
    """Best-effort redaction of obvious secrets in container logs."""
    out = text
    for pat in _REDACT_PATTERNS:
        out = pat.sub("<redacted>", out)
    return out
