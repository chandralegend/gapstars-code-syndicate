"""FastAPI application entrypoint."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import events as events_api
from app.api import tasks as tasks_api
from app.api import vnc_proxy
from app.core import docker_manager
from app.core.config import get_settings
from app.core.retention import RetentionSweeper
from app.core.task_runner import TaskRunner
from app.db import init_db

logger = logging.getLogger(__name__)


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    settings = get_settings()
    init_db()
    # Best-effort cleanup of any lingering containers from previous runs.
    try:
        docker_manager.sweep_orphans()
    except Exception as e:  # pragma: no cover
        logger.warning("orphan sweep failed: %s", e)

    runner = TaskRunner(max_concurrency=settings.max_concurrent_tasks)
    await runner.start()
    app.state.task_runner = runner

    sweeper = RetentionSweeper(interval_seconds=3600)
    await sweeper.start()
    app.state.retention_sweeper = sweeper

    try:
        yield
    finally:
        await runner.stop()
        await sweeper.stop()


app = FastAPI(title="claude-sandbox-svc", version="0.1.0", lifespan=lifespan)
app.include_router(tasks_api.router)
app.include_router(events_api.router)
app.include_router(vnc_proxy.router)


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok"}
