"""Agent 4 worker — drives a sandbox task that produces a script bundle.

Mirrors Agent 2's general structure (create task, poll, soft-success on
timeout, retry on transient HTTP errors) but:

- Loads project context + feature expectation + approved test cases
  from the DB (rather than from LangGraph state).
- Reads ``manifest.json`` from the sandbox workspace at the end and
  attaches it to the bundle row.
- Emits ``script_bundle_*`` agent_events under the node name
  ``script_generation`` so the run timeline picks them up.
- Lives outside the LangGraph state machine — invoked from a route
  handler with ``asyncio.create_task``.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid

from sqlalchemy import select

from api.config import settings
from api.db.engine import async_session_maker
from api.db.models.agent_event import AgentEvent
from api.db.models.test_case import TestCase, TestCaseStatus
from api.db.models.test_script_bundle import TestScriptBundleStatus
from api.sandbox import (
    TERMINAL_STATUSES,
    SandboxClient,
    SandboxError,
    SandboxTaskState,
)
from api.script_generation.prompt import BUNDLE_CONTRACT, build_agent_4_prompt
from api.services import (
    agent_event_service,
    feature_expectation_service,
    project_service,
    run_service,
    test_case_service,
    test_script_bundle_service,
)

logger = logging.getLogger(__name__)

# Limits roughly mirroring Agent 2's safety net.
_MAX_CONSECUTIVE_POLL_ERRORS = 10
_BUNDLE_TIMEOUT_SECONDS = 600  # 10 minutes; longer than Agent 2's 360s
_BUNDLE_MAX_ITERATIONS = 30


async def run_script_generation(run_id: uuid.UUID, bundle_id: uuid.UUID) -> None:
    """Drive script generation for a bundle row.

    Caller is responsible for spawning this with ``asyncio.create_task``.
    Errors are caught and persisted to the bundle row as ``failed``;
    we never let exceptions propagate back to the caller.
    """
    try:
        await _run(run_id, bundle_id)
    except Exception as exc:  # pragma: no cover — last-resort cleanup
        logger.exception("script generation crashed for bundle %s", bundle_id)
        try:
            async with async_session_maker() as session:
                await test_script_bundle_service.update_status(
                    session,
                    bundle_id,
                    TestScriptBundleStatus.FAILED,
                    error=repr(exc),
                    finished=True,
                )
                await agent_event_service.create(
                    session,
                    run_id,
                    node_name="script_generation",
                    event_type="script_bundle_failed",
                    payload={"bundle_id": str(bundle_id), "error": repr(exc)},
                )
        except Exception:
            logger.exception("could not mark bundle %s failed", bundle_id)


async def _run(run_id: uuid.UUID, bundle_id: uuid.UUID) -> None:
    # 1. Gather inputs.
    inputs = await _gather_inputs(run_id)

    if not inputs["approved_test_cases"]:
        await _fail(
            bundle_id,
            run_id,
            "Cannot generate scripts: no approved test cases for this run.",
        )
        return

    # 2. Mark running and emit a starting event.
    async with async_session_maker() as session:
        await test_script_bundle_service.update_status(
            session, bundle_id, TestScriptBundleStatus.RUNNING
        )
        await agent_event_service.create(
            session,
            run_id,
            node_name="script_generation",
            event_type="script_bundle_started",
            payload={
                "bundle_id": str(bundle_id),
                "test_count": len(inputs["approved_test_cases"]),
            },
        )

    # 3. Build prompt and create the sandbox task.
    prompt = build_agent_4_prompt(
        project_context=inputs["project_context"],
        feature_expectation=inputs["feature_expectation"],
        workspace_findings=inputs["findings"],
        approved_test_cases=inputs["approved_test_cases"],
    )

    async with SandboxClient(settings.sandbox_base_url) as sandbox:
        try:
            task_id = await sandbox.create_task(
                prompt=prompt,
                model=settings.sandbox_default_model,
                system_prompt_suffix=BUNDLE_CONTRACT,
                timeout_seconds=_BUNDLE_TIMEOUT_SECONDS,
                max_iterations=_BUNDLE_MAX_ITERATIONS,
            )
        except SandboxError as exc:
            await _fail(bundle_id, run_id, f"sandbox create failed: {exc}")
            return

        async with async_session_maker() as session:
            await test_script_bundle_service.update_status(
                session,
                bundle_id,
                TestScriptBundleStatus.RUNNING,
                sandbox_task_id=task_id,
            )
            await agent_event_service.create(
                session,
                run_id,
                node_name="script_generation",
                event_type="script_bundle_progress",
                payload={
                    "bundle_id": str(bundle_id),
                    "task_id": task_id,
                    "phase": "sandbox_task_created",
                    "timeout_seconds": _BUNDLE_TIMEOUT_SECONDS,
                },
            )

        # 4. Poll until the task is terminal (with the same retry
        #    behaviour Agent 2 uses).
        try:
            terminal_state = await _poll_until_terminal(
                sandbox, task_id, run_id, bundle_id
            )
        except SandboxError as exc:
            await _fail(bundle_id, run_id, f"sandbox poll failed: {exc}")
            return

        # 5. Read manifest.json + run.sh from the workspace.
        manifest_text = await _safe_read(
            sandbox, task_id, "output/workspace/manifest.json"
        )
        run_sh_text = await _safe_read(
            sandbox, task_id, "output/workspace/run.sh"
        )

    # 6. Decide outcome.
    has_required = bool(manifest_text) and bool(run_sh_text)
    is_succeeded = terminal_state.status == "succeeded"
    is_soft_success = terminal_state.status == "timeout" and has_required

    if not has_required:
        # Hard failure — no usable bundle even on a clean exit.
        msg = (
            f"sandbox finished with status={terminal_state.status} but "
            f"manifest.json or run.sh was missing"
        )
        await _fail(bundle_id, run_id, msg)
        return

    if not is_succeeded and not is_soft_success:
        await _fail(
            bundle_id,
            run_id,
            f"sandbox failed: status={terminal_state.status} "
            f"error={terminal_state.error or 'unknown'}",
        )
        return

    # 7. Parse manifest, attach to bundle, mark succeeded.
    try:
        manifest = json.loads(manifest_text or "{}")
    except json.JSONDecodeError as exc:
        await _fail(bundle_id, run_id, f"manifest.json is not valid JSON: {exc}")
        return

    async with async_session_maker() as session:
        await test_script_bundle_service.attach_manifest(session, bundle_id, manifest)
        await test_script_bundle_service.update_status(
            session,
            bundle_id,
            TestScriptBundleStatus.SUCCEEDED,
            finished=True,
        )
        await agent_event_service.create(
            session,
            run_id,
            node_name="script_generation",
            event_type="script_bundle_succeeded",
            payload={
                "bundle_id": str(bundle_id),
                "task_id": task_id,
                "framework": manifest.get("framework"),
                "language": manifest.get("language"),
                "test_count": manifest.get("test_count"),
                "soft_success": is_soft_success,
            },
        )


# ── Helpers ─────────────────────────────────────────────────────────────────


async def _gather_inputs(run_id: uuid.UUID) -> dict:
    """Pull project context, FE, prior workspace findings, and approved cases."""
    async with async_session_maker() as session:
        run = await run_service.get_by_id(session, run_id)
        if run is None:
            return _empty_inputs()
        scenario = await session.get(
            __import__(
                "api.db.models.test_scenario", fromlist=["TestScenario"]
            ).TestScenario,
            run.test_scenario_id,
        )
        project = (
            await project_service.get_by_id(session, scenario.project_id)
            if scenario
            else None
        )
        fe = await feature_expectation_service.get_latest_by_run(session, run_id)

        # Approved test cases from the latest version.
        all_cases = await test_case_service.list_by_run(session, run_id)
        latest_version = max((c.version for c in all_cases), default=0)
        approved = [
            _serialise_case(c)
            for c in all_cases
            if c.version == latest_version
            and c.status == TestCaseStatus.APPROVED.value
        ]

        # Find Agent 2's most recent sandbox task to pull findings.md.
        ev = await session.execute(
            select(AgentEvent)
            .where(
                AgentEvent.run_id == run_id,
                AgentEvent.event_type == "sandbox_task_created",
                AgentEvent.node_name == "agent_2_placeholder",
            )
            .order_by(AgentEvent.created_at.desc())
            .limit(1)
        )
        agent2_task: AgentEvent | None = ev.scalar_one_or_none()

    findings: str | None = None
    if agent2_task and agent2_task.payload:
        prior_task_id = agent2_task.payload.get("task_id")
        if isinstance(prior_task_id, str):
            try:
                async with SandboxClient(settings.sandbox_base_url) as sandbox:
                    findings = await sandbox.read_artifact_text(
                        prior_task_id, "output/workspace/findings.md"
                    )
            except SandboxError as exc:
                logger.warning(
                    "could not read prior findings.md for run %s: %s", run_id, exc
                )

    project_context = (
        {
            "name": project.name,
            "description": project.description,
            "problem_statement": project.problem_statement,
            "target_users": project.target_users,
            "tech_stack": project.tech_stack,
            "additional_context": project.additional_context,
        }
        if project
        else {}
    )

    return {
        "project_context": project_context,
        "feature_expectation": (fe.content if fe else {}),
        "findings": findings,
        "approved_test_cases": approved,
    }


def _empty_inputs() -> dict:
    return {
        "project_context": {},
        "feature_expectation": {},
        "findings": None,
        "approved_test_cases": [],
    }


def _serialise_case(case: TestCase) -> dict:
    return {
        "id": str(case.id),
        "title": case.title,
        "category": case.category,
        "description": case.description,
        "preconditions": case.preconditions,
        "steps": case.steps,
        "expected_result": case.expected_result,
        "rationale": case.rationale,
    }


async def _poll_until_terminal(
    sandbox: SandboxClient,
    task_id: str,
    run_id: uuid.UUID,
    bundle_id: uuid.UUID,
) -> SandboxTaskState:
    """Wait for the sandbox task to reach a terminal state, with retries."""
    interval = max(0.5, float(settings.sandbox_poll_interval_seconds))
    last_status: str | None = None
    consecutive_errors = 0
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
                "script-gen poll error %d/%d: %s",
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
                    node_name="script_generation",
                    event_type="script_bundle_progress",
                    payload={
                        "bundle_id": str(bundle_id),
                        "task_id": task_id,
                        "status": current.status,
                    },
                )
            last_status = current.status

        if current.status in TERMINAL_STATUSES:
            return current
        await asyncio.sleep(interval)


async def _safe_read(
    sandbox: SandboxClient, task_id: str, path: str
) -> str | None:
    try:
        return await sandbox.read_artifact_text(task_id, path)
    except SandboxError as exc:
        logger.warning("could not read %s for task %s: %s", path, task_id, exc)
        return None


async def _fail(
    bundle_id: uuid.UUID, run_id: uuid.UUID, message: str
) -> None:
    async with async_session_maker() as session:
        await test_script_bundle_service.update_status(
            session,
            bundle_id,
            TestScriptBundleStatus.FAILED,
            error=message,
            finished=True,
        )
        await agent_event_service.create(
            session,
            run_id,
            node_name="script_generation",
            event_type="script_bundle_failed",
            payload={"bundle_id": str(bundle_id), "error": message},
        )
    logger.warning("script generation failed for bundle %s: %s", bundle_id, message)
