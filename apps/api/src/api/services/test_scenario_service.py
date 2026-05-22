from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models.test_scenario import TestScenario, TestScenarioStatus
from api.schemas.test_scenario import TestScenarioCreate, TestScenarioUpdate


async def create(
    session: AsyncSession, project_id: uuid.UUID, data: TestScenarioCreate
) -> TestScenario:
    scenario = TestScenario(project_id=project_id, **data.model_dump())
    session.add(scenario)
    await session.commit()
    await session.refresh(scenario)
    return scenario


async def get_by_id(session: AsyncSession, scenario_id: uuid.UUID) -> TestScenario | None:
    return await session.get(TestScenario, scenario_id)


async def list_by_project(
    session: AsyncSession, project_id: uuid.UUID
) -> list[TestScenario]:
    result = await session.execute(
        select(TestScenario)
        .where(TestScenario.project_id == project_id)
        .order_by(TestScenario.created_at.desc())
    )
    return list(result.scalars().all())


async def update(
    session: AsyncSession, scenario_id: uuid.UUID, data: TestScenarioUpdate
) -> TestScenario | None:
    scenario = await session.get(TestScenario, scenario_id)
    if not scenario:
        return None
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(scenario, field, value)
    scenario.updated_at = datetime.utcnow()
    session.add(scenario)
    await session.commit()
    await session.refresh(scenario)
    return scenario


async def update_status(
    session: AsyncSession, scenario_id: uuid.UUID, status: TestScenarioStatus
) -> TestScenario | None:
    scenario = await session.get(TestScenario, scenario_id)
    if not scenario:
        return None
    scenario.status = status
    scenario.updated_at = datetime.utcnow()
    session.add(scenario)
    await session.commit()
    await session.refresh(scenario)
    return scenario


async def delete(session: AsyncSession, scenario_id: uuid.UUID) -> bool:
    scenario = await session.get(TestScenario, scenario_id)
    if not scenario:
        return False
    await session.delete(scenario)
    await session.commit()
    return True
