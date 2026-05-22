from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models.run import Run, RunStatus


async def create(
    session: AsyncSession, test_scenario_id: uuid.UUID, thread_id: str
) -> Run:
    run = Run(test_scenario_id=test_scenario_id, thread_id=thread_id)
    session.add(run)
    await session.commit()
    await session.refresh(run)
    return run


async def get_by_id(session: AsyncSession, run_id: uuid.UUID) -> Run | None:
    return await session.get(Run, run_id)


async def get_by_thread_id(session: AsyncSession, thread_id: str) -> Run | None:
    result = await session.execute(select(Run).where(Run.thread_id == thread_id))
    return result.scalar_one_or_none()


async def list_by_scenario(
    session: AsyncSession, test_scenario_id: uuid.UUID
) -> list[Run]:
    result = await session.execute(
        select(Run)
        .where(Run.test_scenario_id == test_scenario_id)
        .order_by(Run.created_at.desc())
    )
    return list(result.scalars().all())


async def update_status(
    session: AsyncSession,
    run_id: uuid.UUID,
    status: RunStatus,
    current_node: str | None = None,
    error: str | None = None,
) -> Run | None:
    run = await session.get(Run, run_id)
    if not run:
        return None
    run.status = status
    if current_node is not None:
        run.current_node = current_node
    if error is not None:
        run.error = error
    run.updated_at = datetime.utcnow()
    session.add(run)
    await session.commit()
    await session.refresh(run)
    return run


async def list_by_project(
    session: AsyncSession, project_id: uuid.UUID
) -> list[Run]:
    """Return every run that belongs to any test scenario under a project."""
    from api.db.models.test_scenario import TestScenario

    result = await session.execute(
        select(Run)
        .join(TestScenario, TestScenario.id == Run.test_scenario_id)
        .where(TestScenario.project_id == project_id)
        .order_by(Run.created_at.desc())
    )
    return list(result.scalars().all())
