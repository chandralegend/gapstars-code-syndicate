# ── Build stage ───────────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /app

# Install build deps for any C extensions in the wheel set.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifest first for layer caching.
COPY pyproject.toml ./

# Create a venv and install runtime dependencies (no project install yet).
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip \
    && /opt/venv/bin/pip install \
        "fastapi>=0.115" \
        "uvicorn[standard]>=0.32" \
        "pydantic>=2.7" \
        "pydantic-settings>=2.4" \
        "sqlalchemy>=2.0" \
        "aiosqlite>=0.20" \
        "docker>=7.1" \
        "python-multipart>=0.0.9" \
        "httpx>=0.27" \
        "websockets>=13.0" \
        "anyio>=4.4"

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

WORKDIR /app

# Bring the prebuilt venv across.
COPY --from=builder /opt/venv /opt/venv

# Copy the application source. The headless docker/ folder is intentionally
# excluded — it's used to build the sandbox image, not this API image.
COPY app/ /app/app/

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DATA_DIR=/data

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
