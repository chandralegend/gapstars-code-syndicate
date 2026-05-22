"""Background retention/cleanup sweeper.

Periodically deletes terminal tasks older than RETENTION_DAYS, removing both
their DB rows and their on-disk task directories.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core import storage
from app.core.config import get_settings
from app.core.models import TERMINAL_STATUSES, Task, TaskStatus
from app.db import session_scope

logger = logging.getLogger(__name__)


class RetentionSweeper:
    def __init__(self, *, interval_seconds: int = 3600):
        self._interval = interval_seconds
        self._stop = asyncio.Event()
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._run_forever(), name="retention-sweeper")

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass

    async def _run_forever(self) -> None:
        try:
            while not self._stop.is_set():
                try:
                    n = sweep_once()
                    if n:
                        logger.info("retention sweeper deleted %d task(s)", n)
                except Exception as e:
                    logger.warning("retention sweep failed: %s", e)
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=self._interval)
                except asyncio.TimeoutError:
                    pass
        except asyncio.CancelledError:
            return


def sweep_once() -> int:
    """Delete terminal tasks older than RETENTION_DAYS. Returns the count removed."""
    settings = get_settings()
    if settings.retention_days <= 0:
        return 0

    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.retention_days)
    removed = 0

    with session_scope() as db:
        rows = db.execute(
            select(Task).where(
                Task.status.in_({s.value for s in TERMINAL_STATUSES}),
                Task.finished_at.is_not(None),
                Task.finished_at < cutoff,
            )
        ).scalars().all()
        for row in rows:
            storage.remove_task_dir(row.id)
            db.delete(row)
            removed += 1
    return removed
