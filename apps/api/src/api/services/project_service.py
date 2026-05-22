from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models.project import Project
from api.schemas.project import ProjectCreate, ProjectUpdate


async def create(session: AsyncSession, data: ProjectCreate) -> Project:
    project = Project.model_validate(data)
    session.add(project)
    await session.commit()
    await session.refresh(project)
    return project


async def get_by_id(session: AsyncSession, project_id: uuid.UUID) -> Project | None:
    return await session.get(Project, project_id)


async def list_all(session: AsyncSession) -> list[Project]:
    result = await session.execute(
        select(Project).order_by(Project.created_at.desc())
    )
    return list(result.scalars().all())


async def update(
    session: AsyncSession, project_id: uuid.UUID, data: ProjectUpdate
) -> Project | None:
    project = await session.get(Project, project_id)
    if not project:
        return None
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    project.updated_at = datetime.utcnow()
    session.add(project)
    await session.commit()
    await session.refresh(project)
    return project


async def delete(session: AsyncSession, project_id: uuid.UUID) -> bool:
    project = await session.get(Project, project_id)
    if not project:
        return False
    await session.delete(project)
    await session.commit()
    return True
