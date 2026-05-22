import json
import uuid
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
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


class RunCreateResponse(BaseModel):
    run_id: uuid.UUID
    thread_id: str

    model_config = {"from_attributes": True}


# ── Create a run (kick off orchestration) ────────────────────────────────────


@router.post(
    "/api/test-scenarios/{scenario_id}/runs",
    response_model=RunCreateResponse,
    status_code=201,
)
async def create_run(
    scenario_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    scenario = await test_scenario_service.get_by_id(session, scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Test scenario not found")

    thread_id = str(uuid.uuid4())
    run = await run_service.create(session, scenario_id, thread_id)
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
    session: AsyncSession = Depends(get_session),
):
    run = await run_service.get_by_id(session, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    if run.status not in ("agent1_review", "agent3_review"):
        raise HTTPException(
            status_code=409,
            detail=f"Run is not awaiting review (status={run.status})",
        )

    # Phase 3 will wire this to Command(resume=...) on the LangGraph graph.
    # For now, just acknowledge the feedback was received.
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
