"""Worker that executes a generated test bundle in claude-sandbox-svc.

Flow:
1. Look up the bundle, confirm it has a sandbox_task_id (the source).
2. Create a new sandbox task with kind=execution + source_task_id.
   sandbox-svc copies output/workspace/ from the source into the new
   task's input/bundle/ before queueing.
3. Poll the new task. On every status change emit an SSE
   ``test_execution_progress`` event so the UI can update.
4. When the task is terminal:
   - Read output/result.json (the runner-emitted summary).
   - Read output/reports/junit.xml for per-test outcomes.
   - Persist per-test rows in test_execution_results.
   - Mark the execution `passed` (no failures) / `failed` / `errored`.
   - Emit a final ``test_execution_succeeded`` / `_failed` /
     ``_errored`` event.

Errors during the worker itself (e.g. the sandbox refused our request)
are caught and stored as `errored`. We never propagate to the caller —
the caller is `asyncio.create_task` so an unhandled exception would
just be dropped.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from api.config import settings
from api.db.models.test_execution import (
    TestExecutionStatus,
    TestExecutionTrigger,
    TestOutcome,
)
from api.db.session import async_session_maker
from api.sandbox.client import SandboxClient, SandboxError, SandboxTaskState
from api.services import (
    agent_event_service,
    test_execution_service,
    test_script_bundle_service,
)

logger = logging.getLogger(__name__)


_NODE = "test_execution"
TERMINAL_STATUSES = {"succeeded", "failed", "timeout", "cancelled"}

# Mirrors the bundle-runner: 10-minute soft default, 30-minute extension.
_DEFAULT_TIMEOUT_SECONDS = 10 * 60
_MAX_CONSECUTIVE_POLL_ERRORS = 5


async def run_test_execution(
    run_id: uuid.UUID, execution_id: uuid.UUID
) -> None:
    """Drive a single test execution to completion.

    Crash-safe: any uncaught exception is logged + the execution is
    marked errored before we return.
    """
    try:
        await _run(run_id, execution_id)
    except Exception as exc:
        logger.exception("test execution crashed for %s", execution_id)
        try:
            async with async_session_maker() as session:
                await test_execution_service.update_status(
                    session,
                    execution_id,
                    TestExecutionStatus.ERRORED,
                    error=f"worker crashed: {exc}",
                    ended=True,
                )
                await agent_event_service.create(
                    session,
                    run_id,
                    node_name=_NODE,
                    event_type="test_execution_errored",
                    payload={
                        "execution_id": str(execution_id),
                        "error": repr(exc),
                    },
                )
        except Exception:
            logger.exception(
                "could not mark execution %s errored", execution_id
            )


async def _run(run_id: uuid.UUID, execution_id: uuid.UUID) -> None:
    # 1. Look up the execution + its bundle.
    async with async_session_maker() as session:
        execution = await test_execution_service.get_by_id(
            session, execution_id
        )
        if execution is None:
            logger.warning("execution %s vanished before exec", execution_id)
            return
        bundle = await test_script_bundle_service.get_by_id(
            session, execution.bundle_id
        )

    if bundle is None:
        await _fail(
            run_id,
            execution_id,
            "bundle row for this execution no longer exists",
        )
        return
    if not bundle.sandbox_task_id:
        await _fail(
            run_id,
            execution_id,
            "bundle has no sandbox_task_id; cannot copy workspace",
        )
        return

    # 2. Mark running and emit a starting event.
    test_count = (
        bundle.test_count
        if isinstance(bundle.test_count, int) and bundle.test_count >= 0
        else 0
    )
    async with async_session_maker() as session:
        await test_execution_service.update_status(
            session,
            execution_id,
            TestExecutionStatus.RUNNING,
            started=True,
        )
        await agent_event_service.create(
            session,
            run_id,
            node_name=_NODE,
            event_type="test_execution_started",
            payload={
                "execution_id": str(execution_id),
                "bundle_id": str(bundle.id),
                "total": test_count,
                "trigger": execution.trigger,
            },
        )

    # 3. Spawn the sandbox-svc execution task.
    async with SandboxClient(settings.sandbox_base_url) as sandbox:
        try:
            task_id = await sandbox.create_task(
                prompt=(
                    "Execute the test bundle copied to "
                    "/task/input/bundle/ and capture its reports/."
                ),
                model=settings.sandbox_default_model,
                timeout_seconds=_DEFAULT_TIMEOUT_SECONDS,
                kind="execution",
                source_task_id=bundle.sandbox_task_id,
            )
        except SandboxError as exc:
            await _fail(
                run_id,
                execution_id,
                f"sandbox create failed: {exc}",
            )
            return

        async with async_session_maker() as session:
            await test_execution_service.update_status(
                session,
                execution_id,
                TestExecutionStatus.RUNNING,
                sandbox_task_id=task_id,
            )

        # 4. Poll until terminal.
        try:
            terminal = await _poll_until_terminal(
                sandbox, task_id, run_id, execution_id
            )
        except SandboxError as exc:
            await _fail(
                run_id,
                execution_id,
                f"sandbox poll failed: {exc}",
            )
            return

        # 5. Pull artifacts.
        result_json_text = await _safe_read(
            sandbox, task_id, "output/result.json"
        )
        # JUnit XML can be large (1MB+ for 25+ tests with traces).
        # Use a generous cap so we never truncate it.
        junit_text = await _safe_read(
            sandbox, task_id, "output/reports/junit.xml",
            max_bytes=8 * 1024 * 1024,
        )
        # Enumerate screenshot files so we can wire them to per-test rows.
        screenshot_paths = await _list_screenshots(sandbox, task_id)

    # 6. Decide outcome based on result.json + JUnit.
    summary, per_test = _interpret_artifacts(
        result_json_text, junit_text, screenshot_paths
    )
    outcome_status = _decide_status(terminal.status, summary)
    error_msg: str | None = None
    if outcome_status == TestExecutionStatus.ERRORED:
        error_msg = (
            f"runner status={terminal.status}, "
            f"runner error={terminal.error or 'unknown'}"
        )

    # 7. Persist + emit final event.
    async with async_session_maker() as session:
        if per_test:
            await test_execution_service.insert_results(
                session, execution_id, per_test
            )
        await test_execution_service.update_status(
            session,
            execution_id,
            outcome_status,
            error=error_msg,
            summary=summary,
            ended=True,
        )
        await agent_event_service.create(
            session,
            run_id,
            node_name=_NODE,
            event_type=_final_event_type(outcome_status),
            payload={
                "execution_id": str(execution_id),
                "summary": summary,
                "error": error_msg,
            },
        )


# ── Polling ─────────────────────────────────────────────────────────────────


async def _poll_until_terminal(
    sandbox: SandboxClient,
    task_id: str,
    run_id: uuid.UUID,
    execution_id: uuid.UUID,
) -> SandboxTaskState:
    """Wait until the sandbox task reaches a terminal state.

    Emits a `test_execution_progress` event each time the container
    status changes (queued -> running -> ...).

    While the container is `running`, also tails ``output/run_bundle.log``
    and emits a ``test_execution_test_outcome`` event for every pytest
    result line we see (``PASSED``, ``FAILED``, ``ERROR``, ``SKIPPED``).
    This gives the UI live per-test feedback without waiting for the
    final JUnit XML.
    """
    interval = max(2.0, float(settings.sandbox_poll_interval_seconds))
    last_status: str | None = None
    consecutive_errors = 0
    log_offset = 0  # byte offset into run_bundle.log, advanced as we read

    while True:
        try:
            current = await sandbox.get_task(task_id)
            consecutive_errors = 0
        except (SandboxError, Exception) as exc:
            consecutive_errors += 1
            if consecutive_errors >= _MAX_CONSECUTIVE_POLL_ERRORS:
                raise SandboxError(
                    f"sandbox poll error {consecutive_errors}x: {exc}"
                ) from exc
            logger.warning(
                "test-exec poll error %d/%d: %s",
                consecutive_errors,
                _MAX_CONSECUTIVE_POLL_ERRORS,
                exc,
            )
            await asyncio.sleep(interval)
            continue

        if current.status != last_status:
            async with async_session_maker() as session:
                await agent_event_service.create(
                    session,
                    run_id,
                    node_name=_NODE,
                    event_type="test_execution_progress",
                    payload={
                        "execution_id": str(execution_id),
                        "task_id": task_id,
                        "status": current.status,
                    },
                )
            last_status = current.status

        # While running, tail the log and emit per-test outcome events.
        if current.status == "running":
            new_text = await _tail_log(sandbox, task_id, log_offset)
            if new_text:
                log_offset += len(new_text.encode())
                outcomes = _parse_pytest_live_output(new_text)
                if outcomes:
                    async with async_session_maker() as session:
                        for outcome in outcomes:
                            await agent_event_service.create(
                                session,
                                run_id,
                                node_name=_NODE,
                                event_type="test_execution_test_outcome",
                                payload={
                                    "execution_id": str(execution_id),
                                    "test_id": outcome["test_id"],
                                    "outcome": outcome["outcome"],
                                },
                            )

        if current.status in TERMINAL_STATUSES:
            return current
        await asyncio.sleep(interval)


async def _tail_log(
    sandbox: SandboxClient, task_id: str, offset: int
) -> str | None:
    """Read run_bundle.log from `offset` bytes onwards.

    Returns the new text or None on any error. Never raises.
    """
    try:
        full = await sandbox.read_artifact_text(
            task_id, "output/run_bundle.log"
        )
        if full is None:
            return None
        encoded = full.encode()
        if offset >= len(encoded):
            return None
        return encoded[offset:].decode(errors="replace")
    except Exception:
        return None


# Pattern matches pytest verbose output lines like:
#   tests/test_foo.py::test_bar PASSED                  [  4%]
#   tests/test_foo.py::test_bar FAILED                  [  8%]
#   tests/test_foo.py::test_bar ERROR
#   tests/test_foo.py::test_bar SKIPPED (...)           [ 12%]
_PYTEST_LINE_RE = re.compile(
    r"^(tests/\S+::(?:\S+))\s+(PASSED|FAILED|ERROR|SKIPPED)",
    re.MULTILINE,
)

_OUTCOME_MAP = {
    "PASSED": TestOutcome.PASSED.value,
    "FAILED": TestOutcome.FAILED.value,
    "ERROR": TestOutcome.ERRORED.value,
    "SKIPPED": TestOutcome.SKIPPED.value,
}


def _parse_pytest_live_output(text: str) -> list[dict[str, str]]:
    """Extract per-test outcomes from a chunk of pytest -v output."""
    results = []
    for match in _PYTEST_LINE_RE.finditer(text):
        test_id = match.group(1)
        raw_outcome = match.group(2)
        results.append(
            {
                "test_id": test_id,
                "outcome": _OUTCOME_MAP.get(raw_outcome, TestOutcome.ERRORED.value),
            }
        )
    return results


async def _list_screenshots(
    sandbox: SandboxClient, task_id: str
) -> list[str]:
    """Return paths like 'output/reports/screenshots/foo.png' for this task."""
    try:
        files = await sandbox.list_files(task_id)
        return [
            str(f.get("path", ""))
            for f in files
            if str(f.get("path", "")).startswith("output/reports/screenshots/")
            and str(f.get("path", "")).endswith(".png")
        ]
    except Exception as exc:
        logger.warning("could not list screenshots for task %s: %s", task_id, exc)
        return []


async def _safe_read(
    sandbox: SandboxClient, task_id: str, path: str,
    max_bytes: int = 256 * 1024,
) -> str | None:
    try:
        return await sandbox.read_artifact_text(
            task_id, path, max_bytes=max_bytes
        )
    except SandboxError as exc:
        logger.warning("could not read %s for task %s: %s", path, task_id, exc)
        return None


# ── Artifact interpretation ─────────────────────────────────────────────────


def _interpret_artifacts(
    result_json_text: str | None,
    junit_text: str | None,
    screenshot_paths: list[str] | None = None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Turn the runner's outputs into a summary + per-test rows."""
    summary: dict[str, Any] = {
        "total": 0, "passed": 0, "failed": 0, "skipped": 0, "errored": 0,
    }

    if result_json_text:
        try:
            parsed = json.loads(result_json_text)
            inner = parsed.get("summary") or {}
            for key in ("total", "passed", "failed", "skipped", "errored"):
                v = inner.get(key)
                if isinstance(v, int):
                    summary[key] = v
        except json.JSONDecodeError as exc:
            logger.warning("result.json parse failed: %s", exc)

    per_test: list[dict[str, Any]] = []
    if junit_text:
        try:
            per_test = _parse_junit_per_test(junit_text, screenshot_paths or [])
        except Exception as exc:
            logger.warning("junit parse failed: %s", exc)

    # Regen counts from per-test rows when the runner summary was absent.
    if summary["total"] == 0 and per_test:
        for r in per_test:
            summary["total"] += 1
            outcome = r["outcome"]
            if outcome == TestOutcome.PASSED.value:
                summary["passed"] += 1
            elif outcome == TestOutcome.FAILED.value:
                summary["failed"] += 1
            elif outcome == TestOutcome.SKIPPED.value:
                summary["skipped"] += 1
            else:
                summary["errored"] += 1

    return summary, per_test


def _nodeid_to_screenshot_key(nodeid: str) -> list[str]:
    """Return candidate screenshot key stems for a given JUnit test id.

    The conftest hook uses ``re.sub(r'[^\\w.-]', '_', item.nodeid)`` where
    ``item.nodeid`` is the pytest node id in path form:
      ``tests/test_foo.py::test_bar[chromium]``

    JUnit XML ``classname`` uses module notation:
      ``tests.test_foo``

    We generate both forms so we match regardless of what the agent
    wrote in the classname.
    """
    # Form 1: direct sanitise (works when classname is already path-like)
    key1 = re.sub(r"[^\w.-]", "_", nodeid)

    # Form 2: convert dotted classname to path form
    # 'tests.test_foo::test_bar[chromium]' ->
    # 'tests/test_foo.py::test_bar[chromium]'
    if "::" in nodeid:
        classname, rest = nodeid.split("::", 1)
        # dots to slashes, last segment gets .py
        parts = classname.split(".")
        path_class = "/".join(parts) + ".py"
        path_nodeid = f"{path_class}::{rest}"
        key2 = re.sub(r"[^\w.-]", "_", path_nodeid)
    else:
        key2 = key1

    return list(dict.fromkeys([key1, key2]))  # deduplicated, order preserved


def _parse_junit_per_test(
    xml_text: str, screenshot_paths: list[str]
) -> list[dict[str, Any]]:
    """Walk the JUnit XML and extract a flat per-test row list.

    For failing/errored tests we look for a matching screenshot under
    output/reports/screenshots/<safe_nodeid>.png using the same
    sanitisation the conftest hook uses.
    """
    # Index screenshots by their stem (filename without .png) for O(1) lookup.
    screenshot_index: dict[str, str] = {}
    for p in screenshot_paths:
        stem = p.rsplit("/", 1)[-1].removesuffix(".png")
        screenshot_index[stem] = p

    root = ET.fromstring(xml_text)
    suites = (
        root.findall("testsuite") if root.tag == "testsuites" else [root]
    )
    rows: list[dict[str, Any]] = []
    for suite in suites:
        for case in suite.findall("testcase"):
            classname = case.get("classname") or ""
            name = case.get("name") or ""
            test_id = f"{classname}::{name}" if classname else name
            duration_attr = case.get("time")
            duration_ms = None
            if duration_attr:
                try:
                    duration_ms = int(float(duration_attr) * 1000)
                except ValueError:
                    pass

            failure = case.find("failure")
            error = case.find("error")
            skipped = case.find("skipped")

            outcome = TestOutcome.PASSED.value
            failure_message: str | None = None
            failure_trace: str | None = None
            screenshot_path: str | None = None

            if failure is not None:
                outcome = TestOutcome.FAILED.value
                failure_message = failure.get("message") or "test failed"
                failure_trace = (failure.text or "").strip() or None
            elif error is not None:
                outcome = TestOutcome.ERRORED.value
                failure_message = error.get("message") or "test errored"
                failure_trace = (error.text or "").strip() or None
            elif skipped is not None:
                outcome = TestOutcome.SKIPPED.value
                failure_message = skipped.get("message") or None

            # Match screenshot for failed/errored tests.
            if outcome in (TestOutcome.FAILED.value, TestOutcome.ERRORED.value):
                for key in _nodeid_to_screenshot_key(test_id):
                    if key in screenshot_index:
                        screenshot_path = screenshot_index[key]
                        break

            rows.append(
                {
                    "test_id": test_id,
                    "outcome": outcome,
                    "duration_ms": duration_ms,
                    "failure_message": failure_message,
                    "failure_trace": failure_trace,
                    "screenshot_path": screenshot_path,
                }
            )
    return rows


def _decide_status(
    terminal_status: str, summary: dict[str, Any]
) -> TestExecutionStatus:
    """Map runner-status + summary to our execution status.

    `passed`  - runner exited cleanly AND no test failed/errored.
    `failed`  - some tests failed/errored, but the runner ran to completion.
    `errored` - runner itself broke (timeout, container crash, etc.).
    """
    if terminal_status not in {"succeeded"}:
        # Runner failed to even produce a clean exit. If it actually
        # collected per-test results, that still counts as a real
        # 'failed' rather than 'errored'.
        if summary.get("total", 0) > 0:
            return TestExecutionStatus.FAILED
        return TestExecutionStatus.ERRORED

    failed = int(summary.get("failed", 0)) + int(summary.get("errored", 0))
    if failed == 0 and summary.get("total", 0) > 0:
        return TestExecutionStatus.PASSED
    if failed > 0:
        return TestExecutionStatus.FAILED
    # Runner clean but produced no tests at all.
    return TestExecutionStatus.ERRORED


def _final_event_type(status: TestExecutionStatus) -> str:
    if status == TestExecutionStatus.PASSED:
        return "test_execution_succeeded"
    if status == TestExecutionStatus.FAILED:
        return "test_execution_failed"
    return "test_execution_errored"


# ── Failure path ────────────────────────────────────────────────────────────


async def _fail(
    run_id: uuid.UUID, execution_id: uuid.UUID, message: str
) -> None:
    async with async_session_maker() as session:
        await test_execution_service.update_status(
            session,
            execution_id,
            TestExecutionStatus.ERRORED,
            error=message,
            ended=True,
        )
        await agent_event_service.create(
            session,
            run_id,
            node_name=_NODE,
            event_type="test_execution_errored",
            payload={"execution_id": str(execution_id), "error": message},
        )
    logger.warning("test execution %s failed: %s", execution_id, message)


# ── Entrypoint helpers wired by the auto-trigger and the manual route ──────


async def queue_auto_execution(run_id: uuid.UUID, bundle_id: uuid.UUID) -> None:
    """Create a queued execution row and kick off the worker.

    Called from the script-generation worker right after a successful
    `script_bundle_succeeded` so a fresh bundle gets exercised without
    the user needing to click anything.
    """
    async with async_session_maker() as session:
        execution = await test_execution_service.create(
            session,
            run_id=run_id,
            bundle_id=bundle_id,
            trigger=TestExecutionTrigger.AUTO,
        )
    asyncio.create_task(run_test_execution(run_id, execution.id))
