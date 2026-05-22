import uuid
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import Column, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from api.db.models.run import Run


class TestCaseCategory(str, Enum):
    HAPPY = "happy"
    EDGE = "edge"
    CORNER = "corner"


class TestCaseStatus(str, Enum):
    DRAFT = "draft"
    APPROVED = "approved"
    REJECTED = "rejected"


class TestCase(SQLModel, table=True):
    __tablename__ = "test_cases"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    run_id: uuid.UUID = Field(foreign_key="runs.id", index=True)
    version: int = Field(default=1)
    category: str = Field(sa_column=Column(String, nullable=False))
    title: str = Field(max_length=255)
    description: str
    preconditions: str | None = None
    steps: list[dict[str, Any]] = Field(sa_column=Column(JSONB, nullable=False))
    expected_result: str
    rationale: str | None = None
    status: str = Field(
        default=TestCaseStatus.DRAFT.value,
        sa_column=Column(String, nullable=False, default=TestCaseStatus.DRAFT.value),
    )
    feedback: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    run: Optional["Run"] = Relationship(back_populates="test_cases")
