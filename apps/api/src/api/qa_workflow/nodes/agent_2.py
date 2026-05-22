"""Agent 2 — workspace exploration via claude-sandbox-svc.

When ``settings.sandbox_enabled`` is true (the default), Agent 2 hands the
approved feature expectation off to claude-sandbox-svc, polls the resulting
task to completion, and returns the artefacts as ``workspace_outputs``.

When disabled, Agent 2 falls back to the original Phase-3 interrupt()
handoff so a developer can drive the workflow manually by POSTing
``workspace_outputs`` via ``/api/runs/:id/feedback``.
"""

from __future__ import annotations

import asyncio
import logging
import uuid

from langgraph.types import interrupt

from api.config import settings
from api.db.engine import async_session_maker
from api.db.models.run import RunStatus
from api.qa_workflow.state import QAWorkflowState
from api.sandbox import (
    TERMINAL_STATUSES,
    SandboxClient,
    SandboxError,
    SandboxTaskState,
)
from api.sandbox.prompt import WORKSPACE_CONTRACT, build_agent_2_prompt
from api.services import agent_event_service, run_service

logger = logging.getLogger(__name__)


# Maximum number of trace lines to keep in the workspace_outputs payload so
# we don't blow up the LangGraph state with multi-megabyte traces.
_TRACE_TAIL_LINES = 20


async def agent_2_placeholder(state: QAWorkflowState) -> dict:
    """Drive a sandbox run end-to-end (or interrupt for manual handoff)."""
    run_id = uuid.UUID(state["run_id"])

    async with async_session_maker() as session:
        await run_service.update_status(
            session, run_id, RunStatus.AGENT2_RUNNING.value, "agent_2_placeholder"
        )

    if not settings.sandbox_enabled:
        return await _manual_handoff(state)

    return await _run_sandbox_task(state, run_id)


# ── Live sandbox flow ───────────────────────────────────────────────────────


async def _run_sandbox_task(state: QAWorkflowState, run_id: uuid.UUID) -> dict:
    feature_expectation = state.get("feature_expectation") or {}
    project_context = state.get("project_context") or {}

    prompt = build_agent_2_prompt(feature_expectation, project_context)

    async with SandboxClient(settings.sandbox_base_url) as sandbox:
        # 1. Create the task.
        try:
            task_id = await sandbox.create_task(
                prompt=prompt,
                model=settings.sandbox_default_model,
                system_prompt_suffix=WORKSPACE_CONTRACT,
                timeout_seconds=settings.sandbox_default_timeout_seconds,
                max_iterations=settings.sandbox_max_iterations,
            )
        except SandboxError as exc:
            await _emit_event(
                run_id,
                event_type="sandbox_task_failed",
                payload={"phase": "create", "error": str(exc)},
            )
            raise

        await _emit_event(
            run_id,
            event_type="sandbox_task_created",
            payload={
                "task_id": task_id,
                "model": settings.sandbox_default_model,
                "timeout_seconds": settings.sandbox_default_timeout_seconds,
            },
        )

        # 2. Poll until terminal.
        terminal_state = await _poll_until_terminal(sandbox, task_id, run_id)

        # 3. Read artefacts.
        outputs = await _collect_outputs(sandbox, task_id, terminal_state)

    has_findings = bool(outputs.get("findings"))
    is_succeeded = terminal_state.status == "succeeded"
    # If the sandbox timed out *but* the agent already wrote findings.md,
    # treat it as a soft success: hand the artefacts to Agent 3 instead of
    # failing the whole run. The timeout usually means a tool call hung
    # near the end — the substantive work is already done.
    is_soft_success = (
        terminal_state.status == "timeout" and has_findings
    )

    if not is_succeeded and not is_soft_success:
        await _emit_event(
            run_id,
            event_type="sandbox_task_failed",
            payload={
                "task_id": task_id,
                "status": terminal_state.status,
                "error": terminal_state.error,
                "has_findings": has_findings,
            },
        )
        raise SandboxError(
            f"sandbox task {task_id} ended with status={terminal_state.status}: "
            f"{terminal_state.error or 'no error message'}"
        )

    if is_soft_success:
        await _emit_event(
            run_id,
            event_type="sandbox_task_recovered",
            payload={
                "task_id": task_id,
                "status": terminal_state.status,
                "note": (
                    "The sandbox hit its deadline but findings.md was already "
                    "written; continuing with what was captured."
                ),
            },
        )

    await _emit_event(
        run_id,
        event_type="sandbox_task_completed",
        payload={
            "task_id": task_id,
            "files": [f["path"] for f in outputs.get("files", [])],
            "has_findings": has_findings,
            "soft_success": is_soft_success,
        },
    )

    return {"workspace_outputs": outputs}


async def _poll_until_terminal(
    sandbox: SandboxClient,
    task_id: str,
    run_id: uuid.UUID,
) -> SandboxTaskState:
    """Poll the sandbox until it reaches a terminal status.

    Emits a one-shot ``sandbox_timeout_warning`` event when remaining
    time drops below ~60 seconds so the frontend can offer to extend.

    Tolerates a short window of transient HTTP errors (e.g. sandbox-svc
    restarted briefly): we retry up to ~30 seconds before giving up.
    """
    interval = max(0.5, float(settings.sandbox_poll_interval_seconds))
    last_status: str | None = None
    warning_emitted = False
    consecutive_errors = 0
    MAX_CONSECUTIVE_ERRORS = 10  # ~30s with 3s interval
    while True:
        try:
            current = await sandbox.get_task(task_id)
            consecutive_errors = 0
        except SandboxError as exc:
            consecutive_errors += 1
            if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                await _emit_event(
                    run_id,
                    event_type="sandbox_task_failed",
                    payload={
                        "phase": "poll",
                        "task_id": task_id,
                        "error": str(exc),
                        "consecutive_errors": consecutive_errors,
                    },
                )
                raise
            logger.warning(
                "sandbox poll error %d/%d for task %s: %s",
                consecutive_errors,
                MAX_CONSECUTIVE_ERRORS,
                task_id,
                exc,
            )
            await asyncio.sleep(interval)
            continue
        except Exception as exc:
            # Network-layer errors (DNS, connection refused) come through
            # httpx as transport exceptions, not SandboxError. Retry them
            # the same way.
            consecutive_errors += 1
            if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                await _emit_event(
                    run_id,
                    event_type="sandbox_task_failed",
                    payload={
                        "phase": "poll",
                        "task_id": task_id,
                        "error": str(exc),
                        "consecutive_errors": consecutive_errors,
                    },
                )
                raise
            logger.warning(
                "sandbox poll transport error %d/%d for task %s: %s",
                consecutive_errors,
                MAX_CONSECUTIVE_ERRORS,
                task_id,
                exc,
            )
            await asyncio.sleep(interval)
            continue

        if current.status != last_status:
            await _emit_event(
                run_id,
                event_type="sandbox_task_progress",
                payload={"task_id": task_id, "status": current.status},
            )
            last_status = current.status

        if current.status in TERMINAL_STATUSES:
            return current

        # Approaching-timeout warning. Best-effort — only fires once per
        # run, and only when the sandbox has surfaced ``started_at``.
        if not warning_emitted and current.status == "running":
            remaining = await _approx_remaining_seconds(sandbox, task_id, current)
            if remaining is not None and remaining <= 60.0:
                await _emit_event(
                    run_id,
                    event_type="sandbox_timeout_warning",
                    payload={
                        "task_id": task_id,
                        "remaining_seconds": round(remaining, 1),
                    },
                )
                warning_emitted = True

        await asyncio.sleep(interval)


async def _approx_remaining_seconds(
    sandbox: SandboxClient,
    task_id: str,
    state: SandboxTaskState,
) -> float | None:
    """Best-effort 'how much budget is left'. Returns None if unknown."""
    if not state.started_at:
        return None
    try:
        # Pull the raw row to read timeout_seconds, which the typed
        # response doesn't expose.
        raw = await sandbox._client.get(f"/tasks/{task_id}")  # noqa: SLF001
        if raw.status_code != 200:
            return None
        body = raw.json()
        timeout_seconds = body.get("timeout_seconds")
        if not isinstance(timeout_seconds, int):
            return None
        from datetime import datetime, timezone

        started = datetime.fromisoformat(state.started_at)
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        elapsed = (datetime.now(timezone.utc) - started).total_seconds()
        return max(0.0, float(timeout_seconds) - elapsed)
    except Exception as exc:
        logger.debug("could not compute remaining seconds: %s", exc)
        return None


async def _collect_outputs(
    sandbox: SandboxClient,
    task_id: str,
    state: SandboxTaskState,
) -> dict:
    """Pull findings, trace tail, and the file list back into `workspace_outputs`."""
    files: list[dict] = []
    findings: str | None = None
    trace_tail: list[str] = []

    try:
        files = await sandbox.list_files(task_id)
    except SandboxError as exc:  # non-fatal — keep going
        logger.warning("sandbox list_files failed for %s: %s", task_id, exc)

    try:
        findings = await sandbox.read_artifact_text(
            task_id, "output/workspace/findings.md"
        )
    except SandboxError as exc:
        logger.warning("sandbox findings read failed for %s: %s", task_id, exc)

    try:
        trace_text = await sandbox.read_artifact_text(
            task_id, "output/trace.jsonl", max_bytes=128 * 1024
        )
        if trace_text:
            trace_tail = trace_text.strip().splitlines()[-_TRACE_TAIL_LINES:]
    except SandboxError as exc:
        logger.warning("sandbox trace read failed for %s: %s", task_id, exc)

    return {
        "task_id": task_id,
        "status": state.status,
        "result": state.result,
        "findings": findings,
        "trace_tail": trace_tail,
        "files": files,
        "vnc_url": state.vnc_url,
        "artifacts_url": state.artifacts_url,
        "error": state.error,
    }


# ── Manual handoff fallback (sandbox disabled) ──────────────────────────────


async def _manual_handoff(state: QAWorkflowState) -> dict:
    """Pause the graph for manual workspace_outputs submission via feedback API."""
    resume_value = interrupt(
        {"type": "agent_2_handoff", "run_id": state["run_id"]}
    )
    return {"workspace_outputs": resume_value.get("workspace_outputs", {})}


# ── Helpers ─────────────────────────────────────────────────────────────────


async def _emit_event(
    run_id: uuid.UUID,
    *,
    event_type: str,
    payload: dict,
) -> None:
    async with async_session_maker() as session:
        await agent_event_service.create(
            session,
            run_id,
            node_name="agent_2_placeholder",
            event_type=event_type,
            payload=payload,
        )
