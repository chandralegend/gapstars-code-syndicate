"""Sandbox-artifact pass-through endpoints.

Surfaces files Agent 2 produced inside the claude-sandbox-svc workspace
(notably ``output/workspace/findings.md``, ``output/workspace/events.jsonl``,
``output/trace.jsonl``, and screenshots under ``output/screenshots/``) so
the frontend can render them without talking to claude-sandbox-svc
directly.

Lookup chain:
    run_id -> agent_events.payload (latest "sandbox_task_created") -> task_id
    task_id -> claude-sandbox-svc HTTP API -> file list / file content
"""

from __future__ import annotations

import logging
import mimetypes
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


class SandboxScreenshot(BaseModel):
    path: str
    url: str
    size: int


class SandboxScreenshotList(BaseModel):
    task_id: str
    count: int
    screenshots: list[SandboxScreenshot]


# Extensions that should be returned as text by the file-fetch endpoint.
# Everything else streams as bytes with a guessed content-type.
_TEXT_EXTENSIONS = {
    ".md",
    ".txt",
    ".json",
    ".jsonl",
    ".log",
    ".html",
    ".csv",
    ".yml",
    ".yaml",
    ".xml",
}


def _is_text_path(path: str) -> bool:
    lower = path.lower()
    return any(lower.endswith(ext) for ext in _TEXT_EXTENSIONS)


def _guess_media_type(path: str) -> str:
    guessed, _ = mimetypes.guess_type(path)
    return guessed or "application/octet-stream"


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


def _check_path(file_path: str) -> str:
    """Normalize and reject path traversal."""
    normalized = file_path.lstrip("/")
    if ".." in normalized.split("/"):
        raise HTTPException(status_code=400, detail="invalid path")
    return normalized


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


@router.get(
    "/api/runs/{run_id}/sandbox/screenshots",
    response_model=SandboxScreenshotList,
)
async def list_sandbox_screenshots(
    run_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> SandboxScreenshotList:
    """Ordered list of screenshot files for the run, newest last.

    Each entry includes a download URL the frontend can use as an ``<img>``
    ``src``.
    """
    run = await run_service.get_by_id(session, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    task_id = await _resolve_task_id(session, run_id)
    if task_id is None:
        return SandboxScreenshotList(task_id="", count=0, screenshots=[])

    async with SandboxClient(settings.sandbox_base_url) as sandbox:
        try:
            files = await sandbox.list_files(task_id)
        except SandboxError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"sandbox-svc error: {exc}",
            ) from exc

    shots: list[SandboxScreenshot] = []
    for f in files:
        path = f.get("path", "")
        if not path.startswith("output/screenshots/"):
            continue
        if not path.lower().endswith((".png", ".jpg", ".jpeg")):
            continue
        shots.append(
            SandboxScreenshot(
                path=path,
                url=f"/api/runs/{run_id}/sandbox/files/{path}",
                size=int(f.get("size", -1)),
            )
        )
    # Filenames are zero-padded sequence numbers, so a string sort is
    # already chronological.
    shots.sort(key=lambda s: s.path)

    return SandboxScreenshotList(
        task_id=task_id,
        count=len(shots),
        screenshots=shots,
    )


@router.get("/api/runs/{run_id}/sandbox/files/{file_path:path}")
async def get_sandbox_file(
    run_id: uuid.UUID,
    file_path: str,
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    """Stream a single artifact file.

    Text-extension files (``.md``, ``.json``, ``.log`` etc.) are decoded and
    returned as ``text/plain; charset=utf-8``; everything else (PNG, JPEG,
    arbitrary binaries) is streamed verbatim with a guessed content-type so
    browsers can render images directly.
    """
    run = await run_service.get_by_id(session, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    task_id = await _resolve_task_id(session, run_id)
    if task_id is None:
        raise HTTPException(
            status_code=404,
            detail="No sandbox task has been created for this run yet",
        )

    normalized = _check_path(file_path)

    async with SandboxClient(settings.sandbox_base_url) as sandbox:
        try:
            if _is_text_path(normalized):
                text = await sandbox.read_artifact_text(task_id, normalized)
                if text is None:
                    raise HTTPException(status_code=404, detail="artifact not found")

                async def stream_text() -> AsyncGenerator[bytes, None]:
                    yield text.encode("utf-8")

                return StreamingResponse(
                    stream_text(),
                    media_type="text/plain; charset=utf-8",
                )

            blob = await sandbox.read_artifact_bytes(task_id, normalized)
        except SandboxError as exc:
            raise HTTPException(
                status_code=502, detail=f"sandbox-svc error: {exc}"
            ) from exc

    if blob is None:
        raise HTTPException(status_code=404, detail="artifact not found")
    body, upstream_type = blob
    media_type = upstream_type if upstream_type and upstream_type != "application/octet-stream" else _guess_media_type(normalized)

    async def stream_bytes() -> AsyncGenerator[bytes, None]:
        yield body

    return StreamingResponse(
        stream_bytes(),
        media_type=media_type,
        # Mark images cacheable on the browser for a short window — the
        # artifacts are immutable once written.
        headers={"Cache-Control": "private, max-age=30"},
    )
