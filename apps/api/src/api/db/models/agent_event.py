import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import Column, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from api.db.models.run import Run


class AgentEvent(SQLModel, table=True):
    __tablename__ = "agent_events"
    __table_args__ = (Index("ix_agent_events_run_created", "run_id", "created_at"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    run_id: uuid.UUID = Field(foreign_key="runs.id", index=True)
    node_name: str
    event_type: str
    payload: dict[str, Any] | None = Field(
        sa_column=Column(JSONB, nullable=True), default=None
    )
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    run: Optional["Run"] = Relationship(back_populates="agent_events")
