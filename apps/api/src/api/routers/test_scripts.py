"""Endpoints for Agent 4 — test-script bundle generation.

Lifecycle:
    POST   /api/runs/{run_id}/scripts                  -> kicks off generation
    GET    /api/runs/{run_id}/scripts                  -> list (latest first)
    GET    /api/runs/{run_id}/scripts/latest           -> latest bundle row
    GET    /api/runs/{run_id}/scripts/latest/files     -> [{path, size}]
    GET    /api/runs/{run_id}/scripts/latest/files/{path}  -> raw file
    GET    /api/runs/{run_id}/scripts/latest/download  -> zip of the workspace
"""

from __future__ import annotations

import asyncio
import logging
import mimetypes
import uuid
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import settings
from api.db.models.test_case import TestCaseStatus
from api.db.models.test_script_bundle import TestScriptBundleStatus
from api.db.session import get_session
from api.sandbox import SandboxClient, SandboxError
from api.schemas.test_script_bundle import TestScriptBundleRead
from api.script_generation import run_script_generation
from api.services import (
    run_service,
    test_case_service,
    test_script_bundle_service,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["test-scripts"])


_TEXT_EXTENSIONS = {
    ".md", ".txt", ".json", ".jsonl", ".log", ".html", ".csv", ".yml",
    ".yaml", ".xml", ".py", ".js", ".ts", ".tsx", ".jsx", ".sh", ".css",
    ".gitignore", ".env", ".toml", ".ini", ".cfg", ".rs", ".go",
}


class SandboxFileEntry(BaseModel):
    path: str
    size: int


class BundleFileList(BaseModel):
    bundle_id: uuid.UUID
    task_id: str | None
    files: list[SandboxFileEntry]


def _is_text_path(path: str) -> bool:
    lower = path.lower()
    return any(lower.endswith(ext) for ext in _TEXT_EXTENSIONS)


def _guess_media_type(path: str) -> str:
    guessed, _ = mimetypes.guess_type(path)
    return guessed or "application/octet-stream"


# ── POST /api/runs/{id}/scripts ──────────────────────────────────────────────


@router.post(
    "/api/runs/{run_id}/scripts",
    response_model=TestScriptBundleRead,
    status_code=201,
)
async def create_script_bundle(
    run_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> TestScriptBundleRead:
    """Kick off script generation for the given run.

    Allowed only when the run is ``completed`` and there is at least
    one approved test case. Returns the fresh bundle row in
    ``pending`` status; the worker fires off in the background.
    """
    run = await run_service.get_by_id(session, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status != "completed":
        raise HTTPException(
            status_code=409,
            detail=(
                f"Run must be completed before generating scripts "
                f"(current status: {run.status})"
            ),
        )

    cases = await test_case_service.list_by_run(session, run_id)
    if not cases:
        raise HTTPException(
            status_code=409,
            detail="Run has no test cases to script",
        )
    latest_version = max(c.version for c in cases)
    approved_count = sum(
        1
        for c in cases
        if c.version == latest_version
        and c.status == TestCaseStatus.APPROVED.value
    )
    if approved_count == 0:
        raise HTTPException(
            status_code=409,
            detail="No approved test cases on the latest version",
        )

    next_version = await test_script_bundle_service.get_next_version(
        session, run_id
    )
    bundle = await test_script_bundle_service.create(
        session, run_id, next_version
    )

    asyncio.create_task(run_script_generation(run_id, bundle.id))

    return TestScriptBundleRead.model_validate(bundle)


# ── List + latest ────────────────────────────────────────────────────────────


@router.get(
    "/api/runs/{run_id}/scripts",
    response_model=list[TestScriptBundleRead],
)
async def list_script_bundles(
    run_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    run = await run_service.get_by_id(session, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return await test_script_bundle_service.list_by_run(session, run_id)


@router.get(
    "/api/runs/{run_id}/scripts/latest",
    response_model=TestScriptBundleRead,
)
async def get_latest_script_bundle(
    run_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> TestScriptBundleRead:
    run = await run_service.get_by_id(session, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    bundle = await test_script_bundle_service.get_latest_by_run(session, run_id)
    if bundle is None:
        raise HTTPException(status_code=404, detail="No bundle yet")
    return TestScriptBundleRead.model_validate(bundle)


# ── Files inside the bundle ─────────────────────────────────────────────────


async def _resolve_latest_task_id(
    session: AsyncSession, run_id: uuid.UUID
) -> tuple[uuid.UUID, str]:
    bundle = await test_script_bundle_service.get_latest_by_run(session, run_id)
    if bundle is None:
        raise HTTPException(status_code=404, detail="No bundle yet")
    if not bundle.sandbox_task_id:
        raise HTTPException(
            status_code=409,
            detail="Bundle has not produced a sandbox task yet",
        )
    return bundle.id, bundle.sandbox_task_id


@router.get(
    "/api/runs/{run_id}/scripts/latest/files",
    response_model=BundleFileList,
)
async def list_bundle_files(
    run_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> BundleFileList:
    bundle_id, task_id = await _resolve_latest_task_id(session, run_id)

    async with SandboxClient(settings.sandbox_base_url) as sandbox:
        try:
            files = await sandbox.list_files(task_id)
        except SandboxError as exc:
            raise HTTPException(
                status_code=502, detail=f"sandbox-svc error: {exc}"
            ) from exc

    # Only surface files actually written by the agent.
    workspace = [
        SandboxFileEntry(path=f.get("path", ""), size=int(f.get("size", -1)))
        for f in files
        if str(f.get("path", "")).startswith("output/workspace/")
    ]
    return BundleFileList(
        bundle_id=bundle_id, task_id=task_id, files=workspace
    )


@router.get("/api/runs/{run_id}/scripts/latest/files/{file_path:path}")
async def get_bundle_file(
    run_id: uuid.UUID,
    file_path: str,
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    _bundle_id, task_id = await _resolve_latest_task_id(session, run_id)
    normalized = file_path.lstrip("/")
    if ".." in normalized.split("/"):
        raise HTTPException(status_code=400, detail="invalid path")

    # Always look under output/workspace/ — that's the bundle root.
    if not normalized.startswith("output/workspace/"):
        normalized = f"output/workspace/{normalized}"

    async with SandboxClient(settings.sandbox_base_url) as sandbox:
        try:
            if _is_text_path(normalized):
                text = await sandbox.read_artifact_text(task_id, normalized)
                if text is None:
                    raise HTTPException(
                        status_code=404, detail="file not found"
                    )

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
        raise HTTPException(status_code=404, detail="file not found")
    body, upstream_type = blob
    media_type = (
        upstream_type
        if upstream_type and upstream_type != "application/octet-stream"
        else _guess_media_type(normalized)
    )

    async def stream_bytes() -> AsyncGenerator[bytes, None]:
        yield body

    return StreamingResponse(stream_bytes(), media_type=media_type)


# ── Download the workspace as a zip ─────────────────────────────────────────


@router.get("/api/runs/{run_id}/scripts/latest/download")
async def download_bundle_zip(
    run_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    _bundle_id, task_id = await _resolve_latest_task_id(session, run_id)

    async with SandboxClient(settings.sandbox_base_url) as sandbox:
        try:
            blob = await sandbox.download_workspace_zip(task_id)
        except SandboxError as exc:
            raise HTTPException(
                status_code=502, detail=f"sandbox-svc error: {exc}"
            ) from exc

    if blob is None:
        raise HTTPException(status_code=404, detail="bundle workspace empty")

    body, filename = blob

    async def stream_zip() -> AsyncGenerator[bytes, None]:
        yield body

    headers = {
        "Content-Disposition": f'attachment; filename="bundle-run-{str(run_id)[:8]}.zip"',
        "Cache-Control": "private, max-age=30",
    }
    return StreamingResponse(
        stream_zip(),
        media_type="application/zip",
        headers=headers,
    )
