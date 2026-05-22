#!/usr/bin/env bash
# Run the FastAPI service locally for development.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

: "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY must be set}"
: "${TOKEN_SECRET:?TOKEN_SECRET must be set (use: python3 -c 'import secrets; print(secrets.token_hex(32))')}"

export DATA_DIR="${DATA_DIR:-$ROOT/data}"
export SANDBOX_IMAGE="${SANDBOX_IMAGE:-qa-sandbox:local}"

exec python -m uvicorn app.main:app --host "${HOST:-127.0.0.1}" --port "${PORT:-8000}" --reload
