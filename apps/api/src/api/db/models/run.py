import uuid
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Column, String
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from api.db.models.agent_event import AgentEvent
    from api.db.models.feature_expectation import FeatureExpectation
    from api.db.models.test_case import TestCase
    from api.db.models.test_scenario import TestScenario


class RunStatus(str, Enum):
    PENDING = "pending"
    AGENT1_RUNNING = "agent1_running"
    AGENT1_REVIEW = "agent1_review"
    AGENT2_RUNNING = "agent2_running"
    AGENT3_RUNNING = "agent3_running"
    AGENT3_REVIEW = "agent3_review"
    COMPLETED = "completed"
    FAILED = "failed"


class Run(SQLModel, table=True):
    __tablename__ = "runs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    test_scenario_id: uuid.UUID = Field(foreign_key="test_scenarios.id", index=True)
    thread_id: str = Field(unique=True, index=True)
    status: str = Field(
        default=RunStatus.PENDING.value,
        sa_column=Column(String, nullable=False, default=RunStatus.PENDING.value),
    )
    current_node: str | None = None
    error: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    test_scenario: Optional["TestScenario"] = Relationship(back_populates="runs")
    feature_expectations: list["FeatureExpectation"] = Relationship(
        back_populates="run",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    test_cases: list["TestCase"] = Relationship(
        back_populates="run",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    agent_events: list["AgentEvent"] = Relationship(
        back_populates="run",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
