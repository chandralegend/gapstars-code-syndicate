from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models.test_case import TestCase, TestCaseCategory, TestCaseStatus


async def bulk_create(
    session: AsyncSession,
    run_id: uuid.UUID,
    version: int,
    cases: list[dict[str, Any]],
) -> list[TestCase]:
    objects = []
    for case_data in cases:
        tc = TestCase(
            run_id=run_id,
            version=version,
            category=TestCaseCategory(case_data["category"]),
            title=case_data["title"],
            description=case_data["description"],
            preconditions=case_data.get("preconditions"),
            steps=case_data["steps"],
            expected_result=case_data["expected_result"],
            rationale=case_data.get("rationale"),
        )
        objects.append(tc)
    session.add_all(objects)
    await session.commit()
    for tc in objects:
        await session.refresh(tc)
    return objects


async def get_next_version(session: AsyncSession, run_id: uuid.UUID) -> int:
    result = await session.execute(
        select(func.coalesce(func.max(TestCase.version), 0)).where(
            TestCase.run_id == run_id
        )
    )
    return result.scalar_one() + 1


async def list_by_run(session: AsyncSession, run_id: uuid.UUID) -> list[TestCase]:
    result = await session.execute(
        select(TestCase)
        .where(TestCase.run_id == run_id)
        .order_by(TestCase.version.desc(), TestCase.category, TestCase.title)
    )
    return list(result.scalars().all())


async def list_by_run_and_version(
    session: AsyncSession, run_id: uuid.UUID, version: int
) -> list[TestCase]:
    result = await session.execute(
        select(TestCase)
        .where(TestCase.run_id == run_id, TestCase.version == version)
        .order_by(TestCase.category, TestCase.title)
    )
    return list(result.scalars().all())


async def update_status(
    session: AsyncSession,
    tc_id: uuid.UUID,
    status: TestCaseStatus,
    feedback: str | None = None,
) -> TestCase | None:
    tc = await session.get(TestCase, tc_id)
    if not tc:
        return None
    tc.status = status
    if feedback is not None:
        tc.feedback = feedback
    session.add(tc)
    await session.commit()
    await session.refresh(tc)
    return tc


async def bulk_update_status(
    session: AsyncSession,
    tc_ids: list[uuid.UUID],
    status: TestCaseStatus,
) -> list[TestCase]:
    updated = []
    for tc_id in tc_ids:
        tc = await session.get(TestCase, tc_id)
        if tc:
            tc.status = status
            session.add(tc)
            updated.append(tc)
    await session.commit()
    for tc in updated:
        await session.refresh(tc)
    return updated
