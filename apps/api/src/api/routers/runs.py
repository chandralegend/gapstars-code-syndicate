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

from api.db.session import get_session
from api.schemas.agent_event import AgentEventRead
from api.schemas.feature_expectation import FeatureExpectationRead
from api.schemas.run import RunRead
from api.schemas.test_case import TestCaseRead
from api.services import (
    agent_event_service,
    feature_expectation_service,
    run_service,
    test_case_service,
    test_scenario_service,
)

router = APIRouter(tags=["runs"])


class FeedbackRequest(BaseModel):
    decision: str = Field(
        ..., description="'approve' or 'revise'", pattern="^(approve|revise)$"
    )
    feedback: str | None = Field(
        default=None, description="Free-text feedback when revising"
    )
    workspace_outputs: dict | None = Field(
        default=None, description="Agent 2 workspace outputs (used when resuming from agent2_running)"
    )


class RunCreateResponse(BaseModel):
    run_id: uuid.UUID
    thread_id: str

    model_config = {"from_attributes": True}


# ── Create a run (kick off orchestration) ────────────────────────────────────


logger = logging.getLogger(__name__)


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

    async def _run_graph():
        try:
            await graph.ainvoke(initial_state, config=config)
        except Exception:
            logger.exception("QA workflow failed for run %s", run.id)

    asyncio.create_task(_run_graph())

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

    async def _resume_graph():
        try:
            await graph.ainvoke(command, config=config)
        except Exception:
            logger.exception("QA workflow resume failed for run %s", run.id)

    asyncio.create_task(_resume_graph())

    await session.refresh(run)
    return run


# ── SSE event stream ────────────────────────────────────────────────────────


@router.get("/api/runs/{run_id}/events")
async def stream_run_events(
    run_id: uuid.UUID,
    after: uuid.UUID | None = None,
    session: AsyncSession = Depends(get_session),
):
    run = await run_service.get_by_id(session, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    async def event_generator() -> AsyncGenerator[dict, None]:
        events = await agent_event_service.list_by_run(session, run_id, after_id=after)
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
        yield {
            "event": "done",
            "data": json.dumps({"run_id": str(run_id)}),
        }

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
