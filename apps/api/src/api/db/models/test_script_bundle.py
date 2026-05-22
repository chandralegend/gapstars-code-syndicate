import uuid
from datetime import datetime
from enum import Enum
from typing import Any

from sqlalchemy import Column, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class TestScriptBundleStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class TestScriptBundle(SQLModel, table=True):
    __tablename__ = "test_script_bundles"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    run_id: uuid.UUID = Field(foreign_key="runs.id", index=True)
    version: int = Field(default=1)
    status: str = Field(
        default=TestScriptBundleStatus.PENDING.value,
        sa_column=Column(
            String, nullable=False, default=TestScriptBundleStatus.PENDING.value
        ),
    )
    framework: str | None = None
    language: str | None = None
    test_count: int | None = None
    manifest: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    sandbox_task_id: str | None = None
    error: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    finished_at: datetime | None = None
