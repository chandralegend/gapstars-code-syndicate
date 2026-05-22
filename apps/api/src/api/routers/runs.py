import asyncio
import json
import logging
import uuid
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Request
from langgraph.types import Command
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from api.db.engine import async_session_maker
from api.db.models.run import RunStatus
from api.db.session import get_session
from api.schemas.feature_expectation import FeatureExpectationRead
from api.schemas.run import RunRead
from api.schemas.test_case import TestCaseRead
from api.services import (
    agent_event_service,
    feature_expectation_service,
    project_service,
    run_service,
    test_case_service,
    test_scenario_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["runs"])


class FeedbackRequest(BaseModel):
    decision: str = Field(
        ..., description="'approve' or 'revise'", pattern="^(approve|revise)$"
    )
    feedback: str | None = Field(
        default=None, description="Free-text feedback when revising"
    )
    workspace_outputs: dict | None = Field(
        default=None,
        description=(
            "Agent 2 workspace outputs. Only used when SANDBOX_ENABLED=false "
            "and the run is paused at the manual Agent 2 handoff interrupt."
        ),
    )


class RunCreateResponse(BaseModel):
    run_id: uuid.UUID
    thread_id: str

    model_config = {"from_attributes": True}


# ── Crash-safe graph runner ──────────────────────────────────────────────────


async def _mark_run_failed(run_id: uuid.UUID, exc: BaseException) -> None:
    """Persist an unhandled graph exception so the run doesn't get stuck."""
    message = repr(exc)
    try:
        async with async_session_maker() as session:
            run = await run_service.get_by_id(session, run_id)
            current_node = run.current_node if run else None
            await run_service.update_status(
                session,
                run_id,
                RunStatus.FAILED.value,
                current_node=current_node,
                error=message,
            )
            await agent_event_service.create(
                session,
                run_id,
                node_name=current_node or "graph",
                event_type="error",
                payload={"node": current_node, "exception": message},
            )
    except Exception:  # pragma: no cover — never let cleanup itself raise
        logger.exception("failed to mark run %s as failed", run_id)


async def _safe_invoke(graph, payload, config, run_id: uuid.UUID) -> None:
    try:
        await graph.ainvoke(payload, config=config)
    except Exception as exc:
        logger.exception("QA workflow failed for run %s", run_id)
        await _mark_run_failed(run_id, exc)


# ── Create a run (kick off orchestration) ────────────────────────────────────


@router.post(
    "/api/test-scenarios/{scenario_id}/runs",
    response_model=RunCreateResponse,
    status_code=201,
)
async def create_run(
    scenario_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    scenario = await test_scenario_service.get_by_id(session, scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Test scenario not found")

    thread_id = str(uuid.uuid4())
    run = await run_service.create(session, scenario_id, thread_id)

    graph = request.app.state.qa_graph
    config = {"configurable": {"thread_id": thread_id}}
    initial_state = {"run_id": str(run.id)}

    asyncio.create_task(_safe_invoke(graph, initial_state, config, run.id))

    return RunCreateResponse(run_id=run.id, thread_id=run.thread_id)


# ── Get run status ───────────────────────────────────────────────────────────


@router.get("/api/runs/{run_id}", response_model=RunRead)
async def get_run(
    run_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    run = await run_service.get_by_id(session, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


# ── List runs by scenario / project ──────────────────────────────────────────


@router.get(
    "/api/test-scenarios/{scenario_id}/runs",
    response_model=list[RunRead],
)
async def list_runs_by_scenario(
    scenario_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    scenario = await test_scenario_service.get_by_id(session, scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Test scenario not found")
    return await run_service.list_by_scenario(session, scenario_id)


@router.get(
    "/api/projects/{project_id}/runs",
    response_model=list[RunRead],
)
async def list_runs_by_project(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    project = await project_service.get_by_id(session, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return await run_service.list_by_project(session, project_id)


# ── Submit human feedback (resume from interrupt) ────────────────────────────


@router.post("/api/runs/{run_id}/feedback", response_model=RunRead)
async def submit_feedback(
    run_id: uuid.UUID,
    body: FeedbackRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    run = await run_service.get_by_id(session, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    allowed_statuses = ("agent1_review", "agent2_running", "agent3_review")
    if run.status not in allowed_statuses:
        raise HTTPException(
            status_code=409,
            detail=f"Run is not awaiting review (status={run.status})",
        )

    graph = request.app.state.qa_graph
    config = {"configurable": {"thread_id": run.thread_id}}

    resume_payload: dict = {"decision": body.decision}
    if body.feedback:
        resume_payload["feedback"] = body.feedback
    if run.status == "agent2_running":
        resume_payload["workspace_outputs"] = body.workspace_outputs or {}

    command = Command(resume=resume_payload)

    asyncio.create_task(_safe_invoke(graph, command, config, run.id))

    await session.refresh(run)
    return run


# ── SSE event stream ────────────────────────────────────────────────────────


_TERMINAL_RUN_STATUSES: frozenset[str] = frozenset({"completed", "failed"})


@router.get("/api/runs/{run_id}/events")
async def stream_run_events(
    run_id: uuid.UUID,
    after: uuid.UUID | None = None,
    session: AsyncSession = Depends(get_session),
):
    """Live tail of agent_events for a run.

    The connection stays open and polls the DB roughly every second, sending
    every new ``agent_event`` row as a Server-Sent Event. The stream ends
    with a ``done`` event once the run is in a terminal status (``completed``
    or ``failed``) and there are no more events to drain.
    """
    run = await run_service.get_by_id(session, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    async def event_generator() -> AsyncGenerator[dict, None]:
        last_id: uuid.UUID | None = after
        idle_terminal_polls = 0
        while True:
            async with async_session_maker() as poll_session:
                events = await agent_event_service.list_by_run(
                    poll_session, run_id, after_id=last_id
                )
                for evt in events:
                    yield {
                        "event": evt.event_type,
                        "data": json.dumps(
                            {
                                "id": str(evt.id),
                                "node_name": evt.node_name,
                                "payload": evt.payload,
                                "created_at": evt.created_at.isoformat(),
                            }
                        ),
                    }
                    last_id = evt.id

                run_now = await run_service.get_by_id(poll_session, run_id)

            if run_now is None:
                yield {
                    "event": "done",
                    "data": json.dumps({"run_id": str(run_id), "status": "missing"}),
                }
                return

            if run_now.status in _TERMINAL_RUN_STATUSES:
                if not events:
                    idle_terminal_polls += 1
                    # Drain one more time before declaring "done" to avoid
                    # racing the persist node's last event write.
                    if idle_terminal_polls >= 2:
                        yield {
                            "event": "done",
                            "data": json.dumps(
                                {
                                    "run_id": str(run_id),
                                    "status": run_now.status,
                                    "error": run_now.error,
                                }
                            ),
                        }
                        return
                else:
                    idle_terminal_polls = 0

            await asyncio.sleep(1.0)

    return EventSourceResponse(event_generator())


# ── Get latest feature expectation ───────────────────────────────────────────


@router.get(
    "/api/runs/{run_id}/feature-expectation",
    response_model=FeatureExpectationRead,
)
async def get_feature_expectation(
    run_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    run = await run_service.get_by_id(session, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    fe = await feature_expectation_service.get_latest_by_run(session, run_id)
    if not fe:
        raise HTTPException(
            status_code=404, detail="No feature expectation generated yet"
        )
    return fe


# ── Get test cases ───────────────────────────────────────────────────────────


@router.get("/api/runs/{run_id}/test-cases", response_model=list[TestCaseRead])
async def get_test_cases(
    run_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    run = await run_service.get_by_id(session, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    return await test_case_service.list_by_run(session, run_id)
