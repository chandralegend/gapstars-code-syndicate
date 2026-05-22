"""Pytest fixtures: isolated data dir per test session, dummy env vars."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def isolated_settings(monkeypatch, tmp_path):
    """Each test gets a fresh data dir + secret + clean settings cache."""
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TOKEN_SECRET", "test-secret-please")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setenv("PUBLIC_BASE_URL", "http://test.local:8000")
    monkeypatch.setenv("MAX_CONCURRENT_TASKS", "1")

    # Reset cached settings + db engine between tests.
    from app.core import config as cfg
    cfg.get_settings.cache_clear()

    import app.db as db
    db._engine = None
    db._SessionLocal = None

    yield
