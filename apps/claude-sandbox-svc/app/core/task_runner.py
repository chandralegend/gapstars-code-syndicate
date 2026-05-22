"""Background task runner.

Pulls queued tasks from the DB, spawns a sandbox container per task, waits
for it to exit (or timeout), persists logs + result, and updates the task row.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.core import docker_manager, storage
from app.core.config import get_settings
from app.core.models import Task, TaskStatus
from app.core.validation import redact_text
from app.db import session_scope

logger = logging.getLogger(__name__)


def _utcnow():
    return datetime.now(timezone.utc)


def reconcile_outcome(
    outcome: "TaskStatus",
    error: str | None,
    result_obj: dict | None,
    error_obj: dict | None,
) -> tuple["TaskStatus", str | None]:
    """Combine container exit signals with the runner-written artifacts.

    Rules:
    - If we thought we succeeded but no result.json and there's an error.json,
      flip to FAILED.
    - If error.json carries a `message`, prefer it as the user-visible error
      since it's the real cause (e.g. "API error from Anthropic: ...").
    """
    if outcome == TaskStatus.SUCCEEDED and result_obj is None and error_obj is not None:
        outcome = TaskStatus.FAILED
    if error_obj is not None:
        runner_msg = error_obj.get("message")
        if runner_msg:
            error = runner_msg
    return outcome, error


class TaskRunner:
    """Single async loop that drains the queue with bounded concurrency."""

    def __init__(self, max_concurrency: int):
        self._sem = asyncio.Semaphore(max_concurrency)
        self._stop = asyncio.Event()
        self._task: asyncio.Task | None = None
        self._cancel_events: dict[str, asyncio.Event] = {}

    # -- lifecycle -----------------------------------------------------------

    async def start(self) -> None:
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._run_forever(), name="task-runner")
        logger.info("task runner started")

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
        logger.info("task runner stopped")

    # -- public api ----------------------------------------------------------

    def request_cancel(self, task_id: str) -> None:
        ev = self._cancel_events.get(task_id)
        if ev is not None:
            ev.set()

    # -- inner loop ----------------------------------------------------------

    async def _run_forever(self) -> None:
        try:
            while not self._stop.is_set():
                task_id = self._claim_next_task()
                if task_id is None:
                    await asyncio.sleep(0.5)
                    continue
                # spawn without waiting so the loop can pick up the next slot
                asyncio.create_task(self._run_one(task_id))
        except asyncio.CancelledError:
            return

    def _claim_next_task(self) -> str | None:
        """Atomically pull the oldest queued task and mark it as starting."""
        with session_scope() as db:
            row = db.execute(
                select(Task)
                .where(Task.status == TaskStatus.QUEUED.value)
                .order_by(Task.created_at.asc())
                .limit(1)
            ).scalar_one_or_none()
            if row is None:
                return None
            row.status = TaskStatus.STARTING.value
            return row.id

    async def _run_one(self, task_id: str) -> None:
        async with self._sem:
            cancel_event = asyncio.Event()
            self._cancel_events[task_id] = cancel_event
            try:
                await self._execute(task_id, cancel_event)
            except Exception as exc:
                logger.exception("task %s crashed", task_id)
                self._mark_failed(task_id, f"runner crashed: {exc}")
            finally:
                self._cancel_events.pop(task_id, None)

    async def _execute(self, task_id: str, cancel_event: asyncio.Event) -> None:
        settings = get_settings()

        # Load task spec from DB
        with session_scope() as db:
            task = db.get(Task, task_id)
            if task is None:
                logger.warning("task %s vanished before exec", task_id)
                return
            user_env = dict(task.spec.get("env") or {})
            timeout = task.timeout_seconds

        # Verify image exists
        try:
            docker_manager.ensure_image(settings.sandbox_image)
        except docker_manager.DockerUnavailable as exc:
            self._mark_failed(task_id, str(exc))
            return

        # Spawn container
        try:
            started = await asyncio.to_thread(
                docker_manager.start_sandbox,
                task_id=task_id,
                task_dir=storage.task_dir(task_id),
                user_env=user_env,
                settings=settings,
            )
        except docker_manager.DockerUnavailable as exc:
            self._mark_failed(task_id, str(exc))
            return

        # Update DB: running
        with session_scope() as db:
            task = db.get(Task, task_id)
            if task is not None:
                task.status = TaskStatus.RUNNING.value
                task.started_at = _utcnow()
                task.container_id = started.container_id
                task.container_name = started.container_name
                task.vnc_port = started.vnc_port

        # Wait for completion or timeout/cancel.
        #
        # The timeout is enforced by a polling loop that re-reads
        # ``task.timeout_seconds`` from the DB on every tick. This means a
        # client can extend the deadline mid-run by ``PATCH /tasks/{id}``
        # to bump ``timeout_seconds``, and we'll honour the new value
        # without needing to restart anything.
        wait_task = asyncio.create_task(
            asyncio.to_thread(docker_manager.wait_sandbox, started.container_id)
        )
        cancel_task = asyncio.create_task(cancel_event.wait())

        started_at = asyncio.get_event_loop().time()
        outcome: TaskStatus
        exit_code: int | None = None
        error: str | None = None
        effective_timeout = timeout

        # Tick every 2s — fast enough for a snappy UX, slow enough not to
        # hammer the DB.
        TIMEOUT_TICK = 2.0

        while True:
            tick = asyncio.create_task(asyncio.sleep(TIMEOUT_TICK))
            done, _pending = await asyncio.wait(
                {wait_task, cancel_task, tick},
                return_when=asyncio.FIRST_COMPLETED,
            )
            tick.cancel()

            if wait_task in done:
                try:
                    wait_result = wait_task.result()
                    exit_code = int(wait_result.get("StatusCode", -1))
                    outcome = (
                        TaskStatus.SUCCEEDED if exit_code == 0 else TaskStatus.FAILED
                    )
                    if outcome == TaskStatus.FAILED:
                        error = f"sandbox exited with code {exit_code}"
                except Exception as exc:
                    outcome = TaskStatus.FAILED
                    error = f"wait error: {exc}"
                break

            if cancel_task in done:
                outcome = TaskStatus.CANCELLED
                error = "cancelled by user"
                await asyncio.to_thread(
                    docker_manager.stop_sandbox, started.container_id
                )
                break

            # Re-read the live timeout in case it was extended.
            with session_scope() as db:
                row = db.get(Task, task_id)
                if row is not None:
                    effective_timeout = row.timeout_seconds

            elapsed = asyncio.get_event_loop().time() - started_at
            if elapsed >= effective_timeout:
                outcome = TaskStatus.TIMEOUT
                error = f"exceeded timeout of {int(effective_timeout)}s"
                await asyncio.to_thread(
                    docker_manager.stop_sandbox, started.container_id
                )
                break

        # Cancel pending watchers
        for t in (wait_task, cancel_task):
            if not t.done():
                t.cancel()

        # Capture logs before removing the container
        try:
            logs = await asyncio.to_thread(docker_manager.fetch_logs, started.container_id)
            try:
                redacted = redact_text(logs.decode("utf-8", errors="replace")).encode("utf-8")
            except Exception:
                redacted = logs
            storage.container_log_path(task_id).write_bytes(redacted)
        except Exception as exc:  # never let log capture fail the task
            logger.warning("log capture failed for %s: %s", task_id, exc)

        # Remove container
        await asyncio.to_thread(docker_manager.remove_sandbox, started.container_id)

        # Read output artifacts
        result_obj = storage.read_output_json(task_id, "result.json")
        error_obj = storage.read_output_json(task_id, "error.json")

        outcome, error = reconcile_outcome(outcome, error, result_obj, error_obj)

        with session_scope() as db:
            task = db.get(Task, task_id)
            if task is not None:
                task.status = outcome.value
                task.exit_code = exit_code
                task.error = error
                task.result_json = result_obj
                task.finished_at = _utcnow()

        logger.info("task %s finished: %s (exit=%s)", task_id, outcome.value, exit_code)

    def _mark_failed(self, task_id: str, message: str) -> None:
        with session_scope() as db:
            task = db.get(Task, task_id)
            if task is not None:
                task.status = TaskStatus.FAILED.value
                task.error = message
                task.finished_at = _utcnow()
        logger.error("task %s failed: %s", task_id, message)
