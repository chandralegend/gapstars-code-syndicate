from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from api.db.models.test_execution import (
    TestExecutionStatus,
    TestExecutionTrigger,
    TestOutcome,
)


class TestExecutionResultRead(BaseModel):
    id: uuid.UUID
    execution_id: uuid.UUID
    test_id: str
    test_case_id: uuid.UUID | None
    outcome: TestOutcome
    duration_ms: int | None
    failure_message: str | None
    failure_trace: str | None
    screenshot_path: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TestExecutionRead(BaseModel):
    id: uuid.UUID
    run_id: uuid.UUID
    bundle_id: uuid.UUID
    status: TestExecutionStatus
    trigger: TestExecutionTrigger
    started_at: datetime | None
    ended_at: datetime | None
    duration_ms: int | None
    summary: dict[str, Any] | None
    sandbox_task_id: str | None
    error: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TestExecutionDetail(TestExecutionRead):
    """Same as TestExecutionRead but with the per-test results array
    eagerly loaded. Used by the detail endpoint."""

    results: list[TestExecutionResultRead]
