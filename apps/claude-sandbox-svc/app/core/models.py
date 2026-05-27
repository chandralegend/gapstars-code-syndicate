"""Database models + Pydantic schemas for the task API."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import JSON, DateTime, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class TaskStatus(str, Enum):
    QUEUED = "queued"
    STARTING = "starting"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"


class TaskKind(str, Enum):
    EXPLORATION = "exploration"
    EXECUTION = "execution"


TERMINAL_STATUSES = {
    TaskStatus.SUCCEEDED,
    TaskStatus.FAILED,
    TaskStatus.TIMEOUT,
    TaskStatus.CANCELLED,
}


class Base(DeclarativeBase):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    status: Mapped[str] = mapped_column(String(16), default=TaskStatus.QUEUED.value, index=True)
    # Default 'exploration' so old rows (pre-execution feature) keep
    # behaving like before.
    kind: Mapped[str] = mapped_column(
        String(16), default=TaskKind.EXPLORATION.value, index=True, server_default=TaskKind.EXPLORATION.value
    )

    prompt: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(String(64))
    spec: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    container_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    container_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    vnc_port: Mapped[int | None] = mapped_column(Integer, nullable=True)

    exit_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    timeout_seconds: Mapped[int] = mapped_column(Integer, default=1800)


# ---- Pydantic API schemas ----------------------------------------------------


class TaskCreate(BaseModel):
    """Body of POST /tasks (sent as the JSON `data` part of multipart/form-data)."""

    prompt: str = Field(..., min_length=1)
    # Defaults to exploration so existing API consumers keep working.
    # `execution` requires `source_task_id` to point at the bundle to run.
    kind: TaskKind = Field(default=TaskKind.EXPLORATION)
    source_task_id: str | None = Field(
        default=None,
        description=(
            "When kind=execution, the task whose output/workspace/ contains the "
            "bundle to execute. Required for execution tasks; ignored otherwise."
        ),
    )
    model: str | None = None
    system_prompt_suffix: str | None = None
    max_iterations: int = Field(default=50, ge=1, le=500)
    max_tokens: int = Field(default=4096, ge=256, le=64000)
    tool_version: str = Field(default="computer_use_20250124")
    only_n_most_recent_images: int | None = Field(default=3, ge=0)
    thinking_budget: int | None = None
    # Anthropic beta header that returns shorter tool messages.
    # Pairs well with Haiku for fast Computer Use.
    token_efficient_tools_beta: bool = False
    timeout_seconds: int = Field(default=1800, ge=30, le=24 * 3600)
    env: dict[str, str] = Field(default_factory=dict)
    provider: str = Field(default="anthropic")


class TaskResponse(BaseModel):
    id: str
    status: TaskStatus
    kind: TaskKind
    prompt: str
    model: str
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    exit_code: int | None
    error: str | None
    result: dict[str, Any] | None
    vnc_url: str | None = None
    artifacts_url: str | None = None
    timeout_seconds: int | None = None

    @classmethod
    def from_orm_with_urls(
        cls, task: Task, vnc_url: str | None = None, artifacts_url: str | None = None
    ) -> "TaskResponse":
        return cls(
            id=task.id,
            status=TaskStatus(task.status),
            kind=TaskKind(task.kind),
            prompt=task.prompt,
            model=task.model,
            created_at=task.created_at,
            started_at=task.started_at,
            finished_at=task.finished_at,
            exit_code=task.exit_code,
            error=task.error,
            result=task.result_json,
            vnc_url=vnc_url,
            artifacts_url=artifacts_url,
            timeout_seconds=task.timeout_seconds,
        )


class TaskCreateResponse(TaskResponse):
    pass
