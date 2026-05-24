"""REST endpoints for test executions.

Surface:

  POST   /api/runs/:id/executions          -- manual trigger / re-run
  GET    /api/runs/:id/executions          -- list, most recent first
  GET    /api/runs/:id/executions/latest   -- shortcut
  GET    /api/executions/:id               -- detail (includes per-test rows)
  DELETE /api/executions/:id               -- cancel a queued/running execution
  GET    /api/executions/:id/artifacts/{path:path}  -- proxied screenshot etc.

Auto-triggered executions are created by the script-generation worker;
this router only handles manual requests + reads.
"""

from __future__ import annotations

import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import settings
from api.db.session import get_session
from api.sandbox.client import SandboxClient, SandboxError
from api.schemas.test_execution import (
    TestExecutionDetail,
    TestExecutionRead,
    TestExecutionResultRead,
)
from api.services import (
    run_service,
    test_execution_service,
    test_script_bundle_service,
)
from api.test_execution import run_test_execution
from api.db.models.test_execution import TestExecutionTrigger

router = APIRouter(prefix="/api", tags=["test-executions"])


# ── Manual trigger ──────────────────────────────────────────────────────────


@router.post(
    "/runs/{run_id}/executions",
    response_model=TestExecutionRead,
    status_code=201,
)
async def create_execution(
    run_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> TestExecutionRead:
    """Manually queue a test execution against the run's latest bundle.

    Allowed only when the run is `completed` and has a successful
    bundle. Returns the new execution row in `queued` state; the
    worker fires off in the background.
    """
    run = await run_service.get_by_id(session, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")

    bundle = await test_script_bundle_service.get_latest_by_run(
        session, run_id
    )
    if bundle is None:
        raise HTTPException(
            status_code=409,
            detail="Run has no test-script bundle to execute",
        )
    if bundle.status != "succeeded":
        raise HTTPException(
            status_code=409,
            detail=(
                f"Bundle is {bundle.status}; only succeeded bundles "
                "can be executed"
            ),
        )

    execution = await test_execution_service.create(
        session,
        run_id=run_id,
        bundle_id=bundle.id,
        trigger=TestExecutionTrigger.MANUAL,
    )

    asyncio.create_task(run_test_execution(run_id, execution.id))
    return TestExecutionRead.model_validate(execution)


# ── Reads ───────────────────────────────────────────────────────────────────


@router.get(
    "/runs/{run_id}/executions",
    response_model=list[TestExecutionRead],
)
async def list_executions(
    run_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[TestExecutionRead]:
    rows = await test_execution_service.list_by_run(session, run_id)
    return [TestExecutionRead.model_validate(r) for r in rows]


@router.get(
    "/runs/{run_id}/executions/latest",
    response_model=TestExecutionRead,
)
async def latest_execution(
    run_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> TestExecutionRead:
    execution = await test_execution_service.get_latest_by_run(
        session, run_id
    )
    if execution is None:
        raise HTTPException(
            status_code=404,
            detail="No executions for this run yet",
        )
    return TestExecutionRead.model_validate(execution)


@router.get(
    "/executions/{execution_id}",
    response_model=TestExecutionDetail,
)
async def get_execution(
    execution_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> TestExecutionDetail:
    execution = await test_execution_service.get_by_id(session, execution_id)
    if execution is None:
        raise HTTPException(status_code=404, detail="Execution not found")
    results = await test_execution_service.list_results(
        session, execution_id
    )
    return TestExecutionDetail(
        **TestExecutionRead.model_validate(execution).model_dump(),
        results=[TestExecutionResultRead.model_validate(r) for r in results],
    )


# ── Cancel ──────────────────────────────────────────────────────────────────


@router.delete(
    "/executions/{execution_id}",
    response_model=TestExecutionRead,
    status_code=200,
)
async def cancel_execution(
    execution_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> TestExecutionRead:
    """Cancel a queued or running execution.

    Sends a cancel request to sandbox-svc (best-effort; the task may have
    already finished by the time we get there) and marks the execution as
    ``errored`` immediately so the UI stops showing it as in-flight.
    Returns 409 if the execution is already in a terminal state.
    """
    execution = await test_execution_service.get_by_id(session, execution_id)
    if execution is None:
        raise HTTPException(status_code=404, detail="Execution not found")

    terminal_statuses = {"passed", "failed", "errored"}
    if execution.status in terminal_statuses:
        raise HTTPException(
            status_code=409,
            detail=f"Execution is already {execution.status}; cannot cancel.",
        )

    # Best-effort cancel in sandbox-svc.
    if execution.sandbox_task_id:
        async with SandboxClient(settings.sandbox_base_url) as sandbox:
            try:
                await sandbox.cancel_task(execution.sandbox_task_id)
            except SandboxError as exc:
                # Log but don't fail the request — we still mark it errored.
                import logging
                logging.getLogger(__name__).warning(
                    "sandbox cancel failed for task %s: %s",
                    execution.sandbox_task_id,
                    exc,
                )

    updated = await test_execution_service.update_status(
        session,
        execution_id,
        "errored",
        error="Cancelled by user",
        ended=True,
    )
    return TestExecutionRead.model_validate(updated)


# ── Artifact proxy ──────────────────────────────────────────────────────────


@router.get("/executions/{execution_id}/artifacts/{path:path}")
async def get_execution_artifact(
    execution_id: uuid.UUID,
    path: str,
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Proxy a file from the execution's sandbox-svc task.

    Used by the UI to load failure screenshots, run-bundle logs, the
    HTML report, etc. We refuse anything outside ``output/`` to keep
    the surface small.
    """
    execution = await test_execution_service.get_by_id(session, execution_id)
    if execution is None:
        raise HTTPException(status_code=404, detail="Execution not found")
    if not execution.sandbox_task_id:
        raise HTTPException(
            status_code=404,
            detail="Execution has no sandbox task yet",
        )
    if not path.startswith("output/"):
        raise HTTPException(
            status_code=400,
            detail="Only output/* artifacts are exposed",
        )

    async with SandboxClient(settings.sandbox_base_url) as sandbox:
        try:
            result = await sandbox.read_artifact_bytes(
                execution.sandbox_task_id, path
            )
        except SandboxError as exc:
            raise HTTPException(
                status_code=404, detail=f"Artifact not available: {exc}"
            ) from exc

    if result is None:
        raise HTTPException(status_code=404, detail="Artifact not found")

    blob, sandbox_content_type = result
    # Prefer our extension-based mime guess (more accurate for png/jpg);
    # fall back to whatever sandbox-svc reported.
    media_type = _guess_media_type(path)
    if media_type == "application/octet-stream":
        media_type = sandbox_content_type
    return Response(content=blob, media_type=media_type)


def _guess_media_type(path: str) -> str:
    lower = path.lower()
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith((".jpg", ".jpeg")):
        return "image/jpeg"
    if lower.endswith(".webp"):
        return "image/webp"
    if lower.endswith(".html"):
        return "text/html; charset=utf-8"
    if lower.endswith(".xml"):
        return "application/xml"
    if lower.endswith(".json"):
        return "application/json"
    if lower.endswith(".log") or lower.endswith(".txt"):
        return "text/plain; charset=utf-8"
    return "application/octet-stream"
