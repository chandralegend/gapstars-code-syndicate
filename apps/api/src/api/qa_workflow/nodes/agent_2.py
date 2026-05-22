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
            payload={"task_id": task_id, "model": settings.sandbox_default_model},
        )

        # 2. Poll until terminal.
        terminal_state = await _poll_until_terminal(sandbox, task_id, run_id)

        # 3. Read artefacts.
        outputs = await _collect_outputs(sandbox, task_id, terminal_state)

    if terminal_state.status != "succeeded":
        await _emit_event(
            run_id,
            event_type="sandbox_task_failed",
            payload={
                "task_id": task_id,
                "status": terminal_state.status,
                "error": terminal_state.error,
            },
        )
        raise SandboxError(
            f"sandbox task {task_id} ended with status={terminal_state.status}: "
            f"{terminal_state.error or 'no error message'}"
        )

    await _emit_event(
        run_id,
        event_type="sandbox_task_completed",
        payload={
            "task_id": task_id,
            "files": [f["path"] for f in outputs.get("files", [])],
            "has_findings": bool(outputs.get("findings")),
        },
    )

    return {"workspace_outputs": outputs}


async def _poll_until_terminal(
    sandbox: SandboxClient,
    task_id: str,
    run_id: uuid.UUID,
) -> SandboxTaskState:
    interval = max(0.5, float(settings.sandbox_poll_interval_seconds))
    last_status: str | None = None
    while True:
        try:
            current = await sandbox.get_task(task_id)
        except SandboxError as exc:
            # Treat transient HTTP errors during polling as a hard failure;
            # the run wrapper in routers/runs.py will mark the run failed.
            await _emit_event(
                run_id,
                event_type="sandbox_task_failed",
                payload={"phase": "poll", "task_id": task_id, "error": str(exc)},
            )
            raise

        if current.status != last_status:
            await _emit_event(
                run_id,
                event_type="sandbox_task_progress",
                payload={"task_id": task_id, "status": current.status},
            )
            last_status = current.status

        if current.status in TERMINAL_STATUSES:
            return current

        await asyncio.sleep(interval)


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
