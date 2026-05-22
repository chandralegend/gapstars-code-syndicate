from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models.test_script_bundle import (
    TestScriptBundle,
    TestScriptBundleStatus,
)


async def create(
    session: AsyncSession,
    run_id: uuid.UUID,
    version: int,
) -> TestScriptBundle:
    bundle = TestScriptBundle(run_id=run_id, version=version)
    session.add(bundle)
    await session.commit()
    await session.refresh(bundle)
    return bundle


async def get_by_id(
    session: AsyncSession, bundle_id: uuid.UUID
) -> TestScriptBundle | None:
    return await session.get(TestScriptBundle, bundle_id)


async def get_latest_by_run(
    session: AsyncSession, run_id: uuid.UUID
) -> TestScriptBundle | None:
    result = await session.execute(
        select(TestScriptBundle)
        .where(TestScriptBundle.run_id == run_id)
        .order_by(TestScriptBundle.version.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def list_by_run(
    session: AsyncSession, run_id: uuid.UUID
) -> list[TestScriptBundle]:
    result = await session.execute(
        select(TestScriptBundle)
        .where(TestScriptBundle.run_id == run_id)
        .order_by(TestScriptBundle.version.desc())
    )
    return list(result.scalars().all())


async def get_next_version(session: AsyncSession, run_id: uuid.UUID) -> int:
    result = await session.execute(
        select(func.coalesce(func.max(TestScriptBundle.version), 0)).where(
            TestScriptBundle.run_id == run_id
        )
    )
    return int(result.scalar_one()) + 1


async def update_status(
    session: AsyncSession,
    bundle_id: uuid.UUID,
    status: TestScriptBundleStatus | str,
    *,
    error: str | None = None,
    sandbox_task_id: str | None = None,
    finished: bool = False,
) -> TestScriptBundle | None:
    bundle = await session.get(TestScriptBundle, bundle_id)
    if not bundle:
        return None
    bundle.status = (
        status.value if isinstance(status, TestScriptBundleStatus) else status
    )
    if error is not None:
        bundle.error = error
    if sandbox_task_id is not None:
        bundle.sandbox_task_id = sandbox_task_id
    if finished:
        bundle.finished_at = datetime.utcnow()
    session.add(bundle)
    await session.commit()
    await session.refresh(bundle)
    return bundle


async def attach_manifest(
    session: AsyncSession,
    bundle_id: uuid.UUID,
    manifest: dict[str, Any],
) -> TestScriptBundle | None:
    bundle = await session.get(TestScriptBundle, bundle_id)
    if not bundle:
        return None
    bundle.manifest = manifest
    framework = manifest.get("framework")
    language = manifest.get("language")
    test_count = manifest.get("test_count")
    if isinstance(framework, str):
        bundle.framework = framework
    if isinstance(language, str):
        bundle.language = language
    if isinstance(test_count, int):
        bundle.test_count = test_count
    session.add(bundle)
    await session.commit()
    await session.refresh(bundle)
    return bundle
