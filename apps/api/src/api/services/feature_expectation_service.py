from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models.feature_expectation import (
    FeatureExpectation,
    FeatureExpectationStatus,
)


async def create(
    session: AsyncSession, run_id: uuid.UUID, content: dict[str, Any], version: int = 1
) -> FeatureExpectation:
    fe = FeatureExpectation(run_id=run_id, version=version, content=content)
    session.add(fe)
    await session.commit()
    await session.refresh(fe)
    return fe


async def create_next_version(
    session: AsyncSession, run_id: uuid.UUID, content: dict[str, Any]
) -> FeatureExpectation:
    result = await session.execute(
        select(func.coalesce(func.max(FeatureExpectation.version), 0)).where(
            FeatureExpectation.run_id == run_id
        )
    )
    max_version: int = result.scalar_one()
    return await create(session, run_id, content, version=max_version + 1)


async def get_latest_by_run(
    session: AsyncSession, run_id: uuid.UUID
) -> FeatureExpectation | None:
    result = await session.execute(
        select(FeatureExpectation)
        .where(FeatureExpectation.run_id == run_id)
        .order_by(FeatureExpectation.version.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def list_by_run(
    session: AsyncSession, run_id: uuid.UUID
) -> list[FeatureExpectation]:
    result = await session.execute(
        select(FeatureExpectation)
        .where(FeatureExpectation.run_id == run_id)
        .order_by(FeatureExpectation.version.asc())
    )
    return list(result.scalars().all())


async def update_status(
    session: AsyncSession,
    fe_id: uuid.UUID,
    status: FeatureExpectationStatus,
    feedback: str | None = None,
) -> FeatureExpectation | None:
    fe = await session.get(FeatureExpectation, fe_id)
    if not fe:
        return None
    fe.status = status
    if feedback is not None:
        fe.feedback = feedback
    session.add(fe)
    await session.commit()
    await session.refresh(fe)
    return fe
