import uuid
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Column, String
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from api.db.models.project import Project
    from api.db.models.run import Run


class TestScenarioStatus(str, Enum):
    DRAFT = "draft"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class TestScenario(SQLModel, table=True):
    __tablename__ = "test_scenarios"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    project_id: uuid.UUID = Field(foreign_key="projects.id", index=True)
    title: str = Field(max_length=255)
    feature_description: str
    user_story: str
    acceptance_criteria: str
    status: str = Field(
        default=TestScenarioStatus.DRAFT.value,
        sa_column=Column(String, nullable=False, default=TestScenarioStatus.DRAFT.value),
    )
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    project: Optional["Project"] = Relationship(back_populates="test_scenarios")
    runs: list["Run"] = Relationship(
        back_populates="test_scenario",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
