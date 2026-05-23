"""SQLModel definitions for test executions and per-test results.

A `TestExecution` is one invocation of a bundle's `run.sh`. It rolls
up the suite-level outcome and timing. Each test inside the suite
gets its own `TestExecutionResult` row so we can later answer
"how often does test X flake?" with plain SQL.
"""

import uuid
from datetime import datetime
from enum import Enum
from typing import Any

from sqlalchemy import Column, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class TestExecutionStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    PASSED = "passed"
    FAILED = "failed"
    ERRORED = "errored"


class TestExecutionTrigger(str, Enum):
    AUTO = "auto"
    MANUAL = "manual"


class TestOutcome(str, Enum):
    PASSED = "passed"
    FAILED = "failed"
    SKIPPED = "skipped"
    ERRORED = "errored"


class TestExecution(SQLModel, table=True):
    __tablename__ = "test_executions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    run_id: uuid.UUID = Field(foreign_key="runs.id", index=True)
    bundle_id: uuid.UUID = Field(
        foreign_key="test_script_bundles.id", index=True
    )
    status: str = Field(
        default=TestExecutionStatus.QUEUED.value,
        sa_column=Column(
            String, nullable=False, default=TestExecutionStatus.QUEUED.value
        ),
    )
    trigger: str = Field(
        default=TestExecutionTrigger.AUTO.value,
        sa_column=Column(
            String, nullable=False, default=TestExecutionTrigger.AUTO.value
        ),
    )
    started_at: datetime | None = None
    ended_at: datetime | None = None
    duration_ms: int | None = None
    summary: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    sandbox_task_id: str | None = None
    error: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


class TestExecutionResult(SQLModel, table=True):
    __tablename__ = "test_execution_results"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    execution_id: uuid.UUID = Field(
        foreign_key="test_executions.id", index=True
    )
    # The id used in the bundle's manifest.json `tests[].id`. We keep
    # it as a free-form string because manifests can carry whatever
    # the generator decides (the pytest nodeid, a UUID, a slug, …).
    test_id: str
    test_case_id: uuid.UUID | None = Field(
        default=None, foreign_key="test_cases.id"
    )
    outcome: str
    duration_ms: int | None = None
    failure_message: str | None = None
    failure_trace: str | None = None
    screenshot_path: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
