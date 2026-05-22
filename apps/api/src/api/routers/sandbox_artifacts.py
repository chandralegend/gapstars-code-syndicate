"""Sandbox-artifact pass-through endpoints.

Surfaces files Agent 2 produced inside the claude-sandbox-svc workspace
(notably ``output/workspace/findings.md``, ``output/workspace/events.jsonl``,
and ``output/trace.jsonl``) so the frontend can render them without
talking to claude-sandbox-svc directly.

Lookup chain:
    run_id -> agent_events.payload (latest "sandbox_task_created") -> task_id
    task_id -> claude-sandbox-svc HTTP API -> file list / file content
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import settings
from api.db.models.agent_event import AgentEvent
from api.db.session import get_session
from api.sandbox import SandboxClient, SandboxError
from api.services import run_service

logger = logging.getLogger(__name__)
router = APIRouter(tags=["sandbox-artifacts"])


class SandboxFile(BaseModel):
    path: str
    size: int


class SandboxFileList(BaseModel):
    task_id: str
    files: list[SandboxFile]


async def _resolve_task_id(
    session: AsyncSession, run_id: uuid.UUID
) -> str | None:
    """Find the sandbox task id for a run by scanning its agent_events."""
    stmt = (
        select(AgentEvent)
        .where(
            AgentEvent.run_id == run_id,
            AgentEvent.event_type == "sandbox_task_created",
        )
        .order_by(AgentEvent.created_at.desc())
        .limit(1)
    )
    result = await session.execute(stmt)
    event: AgentEvent | None = result.scalar_one_or_none()
    if event is None:
        return None
    payload: dict[str, Any] = event.payload or {}
    task_id = payload.get("task_id")
    return str(task_id) if task_id else None


@router.get(
    "/api/runs/{run_id}/sandbox/files",
    response_model=SandboxFileList,
)
async def list_sandbox_files(
    run_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> SandboxFileList:
    run = await run_service.get_by_id(session, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    task_id = await _resolve_task_id(session, run_id)
    if task_id is None:
        raise HTTPException(
            status_code=404,
            detail="No sandbox task has been created for this run yet",
        )

    async with SandboxClient(settings.sandbox_base_url) as sandbox:
        try:
            files = await sandbox.list_files(task_id)
        except SandboxError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"sandbox-svc error: {exc}",
            ) from exc

    return SandboxFileList(
        task_id=task_id,
        files=[
            SandboxFile(path=f.get("path", ""), size=int(f.get("size", -1)))
            for f in files
        ],
    )


@router.get("/api/runs/{run_id}/sandbox/files/{file_path:path}")
async def get_sandbox_file(
    run_id: uuid.UUID,
    file_path: str,
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    run = await run_service.get_by_id(session, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    task_id = await _resolve_task_id(session, run_id)
    if task_id is None:
        raise HTTPException(
            status_code=404,
            detail="No sandbox task has been created for this run yet",
        )

    # Path-traversal guard: only allow simple relative paths under the
    # task root. The sandbox-svc does its own check too, but it's cheap
    # to refuse early.
    normalized = file_path.lstrip("/")
    if ".." in normalized.split("/"):
        raise HTTPException(status_code=400, detail="invalid path")

    async with SandboxClient(settings.sandbox_base_url) as sandbox:
        try:
            text = await sandbox.read_artifact_text(task_id, normalized)
        except SandboxError as exc:
            raise HTTPException(
                status_code=502, detail=f"sandbox-svc error: {exc}"
            ) from exc

    if text is None:
        raise HTTPException(status_code=404, detail="artifact not found")

    async def stream() -> AsyncGenerator[bytes, None]:
        yield text.encode("utf-8")

    return StreamingResponse(stream(), media_type="text/plain; charset=utf-8")
