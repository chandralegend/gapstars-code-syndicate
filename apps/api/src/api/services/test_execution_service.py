from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models.test_execution import (
    TestExecution,
    TestExecutionResult,
    TestExecutionStatus,
    TestExecutionTrigger,
    TestOutcome,
)


async def create(
    session: AsyncSession,
    *,
    run_id: uuid.UUID,
    bundle_id: uuid.UUID,
    trigger: TestExecutionTrigger | str = TestExecutionTrigger.AUTO,
) -> TestExecution:
    """Insert a fresh execution row in `queued` state."""
    execution = TestExecution(
        run_id=run_id,
        bundle_id=bundle_id,
        trigger=(
            trigger.value
            if isinstance(trigger, TestExecutionTrigger)
            else trigger
        ),
    )
    session.add(execution)
    await session.commit()
    await session.refresh(execution)
    return execution


async def get_by_id(
    session: AsyncSession, execution_id: uuid.UUID
) -> TestExecution | None:
    return await session.get(TestExecution, execution_id)


async def get_latest_by_run(
    session: AsyncSession, run_id: uuid.UUID
) -> TestExecution | None:
    result = await session.execute(
        select(TestExecution)
        .where(TestExecution.run_id == run_id)
        .order_by(TestExecution.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def list_by_run(
    session: AsyncSession, run_id: uuid.UUID, *, limit: int = 50
) -> list[TestExecution]:
    result = await session.execute(
        select(TestExecution)
        .where(TestExecution.run_id == run_id)
        .order_by(TestExecution.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def update_status(
    session: AsyncSession,
    execution_id: uuid.UUID,
    status: TestExecutionStatus | str,
    *,
    error: str | None = None,
    sandbox_task_id: str | None = None,
    summary: dict[str, Any] | None = None,
    started: bool = False,
    ended: bool = False,
) -> TestExecution | None:
    execution = await session.get(TestExecution, execution_id)
    if not execution:
        return None
    execution.status = (
        status.value if isinstance(status, TestExecutionStatus) else status
    )
    if error is not None:
        execution.error = error
    if sandbox_task_id is not None:
        execution.sandbox_task_id = sandbox_task_id
    if summary is not None:
        execution.summary = summary
    now = datetime.utcnow()
    if started and execution.started_at is None:
        execution.started_at = now
    if ended:
        execution.ended_at = now
        if execution.started_at is not None:
            delta = now - execution.started_at
            execution.duration_ms = int(delta.total_seconds() * 1000)
    session.add(execution)
    await session.commit()
    await session.refresh(execution)
    return execution


async def list_results(
    session: AsyncSession, execution_id: uuid.UUID
) -> list[TestExecutionResult]:
    result = await session.execute(
        select(TestExecutionResult)
        .where(TestExecutionResult.execution_id == execution_id)
        .order_by(TestExecutionResult.created_at.asc())
    )
    return list(result.scalars().all())


async def insert_results(
    session: AsyncSession,
    execution_id: uuid.UUID,
    results: list[dict[str, Any]],
) -> int:
    """Bulk-insert per-test rows. Returns the number written."""
    rows = [
        TestExecutionResult(
            execution_id=execution_id,
            test_id=str(r.get("test_id") or ""),
            test_case_id=r.get("test_case_id"),
            outcome=(
                r["outcome"].value
                if isinstance(r.get("outcome"), TestOutcome)
                else str(r.get("outcome") or TestOutcome.ERRORED.value)
            ),
            duration_ms=r.get("duration_ms"),
            failure_message=r.get("failure_message"),
            failure_trace=r.get("failure_trace"),
            screenshot_path=r.get("screenshot_path"),
        )
        for r in results
    ]
    session.add_all(rows)
    await session.commit()
    return len(rows)
