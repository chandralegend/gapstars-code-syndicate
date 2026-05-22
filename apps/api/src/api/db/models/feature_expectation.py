import uuid
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import Column, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from api.db.models.run import Run


class FeatureExpectationStatus(str, Enum):
    DRAFT = "draft"
    APPROVED = "approved"
    REJECTED = "rejected"


class FeatureExpectation(SQLModel, table=True):
    __tablename__ = "feature_expectations"
    __table_args__ = (UniqueConstraint("run_id", "version"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    run_id: uuid.UUID = Field(foreign_key="runs.id", index=True)
    version: int = Field(default=1)
    content: dict[str, Any] = Field(sa_column=Column(JSONB, nullable=False))
    status: str = Field(
        default=FeatureExpectationStatus.DRAFT.value,
        sa_column=Column(String, nullable=False, default=FeatureExpectationStatus.DRAFT.value),
    )
    feedback: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    run: Optional["Run"] = Relationship(back_populates="feature_expectations")
