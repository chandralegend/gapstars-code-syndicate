from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models.agent_event import AgentEvent


async def create(
    session: AsyncSession,
    run_id: uuid.UUID,
    node_name: str,
    event_type: str,
    payload: dict[str, Any] | None = None,
) -> AgentEvent:
    event = AgentEvent(
        run_id=run_id,
        node_name=node_name,
        event_type=event_type,
        payload=payload,
    )
    session.add(event)
    await session.commit()
    await session.refresh(event)
    return event


async def list_by_run(
    session: AsyncSession,
    run_id: uuid.UUID,
    after_id: uuid.UUID | None = None,
) -> list[AgentEvent]:
    stmt = select(AgentEvent).where(AgentEvent.run_id == run_id)
    if after_id:
        ref = await session.get(AgentEvent, after_id)
        if ref:
            stmt = stmt.where(AgentEvent.created_at > ref.created_at)
    stmt = stmt.order_by(AgentEvent.created_at.asc())
    result = await session.execute(stmt)
    return list(result.scalars().all())
