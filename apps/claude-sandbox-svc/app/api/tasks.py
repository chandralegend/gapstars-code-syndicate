"""REST endpoints for tasks."""

from __future__ import annotations

import json
import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select

from app.core import storage, tokens
from app.core.config import get_settings
from app.core.models import Task, TaskCreate, TaskResponse, TaskStatus, TERMINAL_STATUSES
from app.core.validation import EnvValidationError, validate_user_env
from app.db import session_scope

logger = logging.getLogger(__name__)
router = APIRouter()


MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB per file


def _build_vnc_url(request: Request, task_id: str) -> str:
    settings = get_settings()
    token = tokens.issue(task_id)
    base = settings.public_base_url.rstrip("/")
    return f"{base}/tasks/{task_id}/viewer?token={token}"


def _build_artifacts_url(task_id: str) -> str:
    base = get_settings().public_base_url.rstrip("/")
    return f"{base}/tasks/{task_id}/artifacts"


def _to_response(task: Task, request: Request | None = None) -> TaskResponse:
    vnc_url = None
    if request is not None and task.status in {
        TaskStatus.RUNNING.value,
        TaskStatus.STARTING.value,
    }:
        vnc_url = _build_vnc_url(request, task.id)
    return TaskResponse.from_orm_with_urls(
        task,
        vnc_url=vnc_url,
        artifacts_url=_build_artifacts_url(task.id),
    )


@router.post("/tasks", status_code=201)
async def create_task(
    request: Request,
    data: str = Form(..., description="JSON-encoded TaskCreate body"),
    files: list[UploadFile] | None = File(default=None),
) -> JSONResponse:
    """Create a new task. `data` is a JSON string with the TaskCreate fields.

    Files (optional) are saved under data/tasks/{id}/input/files/.
    """
    try:
        payload = json.loads(data)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"invalid JSON in 'data': {e}") from e

    try:
        spec = TaskCreate.model_validate(payload)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors()) from e

    settings = get_settings()
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=500, detail="server is missing ANTHROPIC_API_KEY")

    try:
        sanitized_env = validate_user_env(spec.env)
    except EnvValidationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    task_id = str(uuid.uuid4())
    storage.init_task_layout(task_id)

    # Save uploaded files
    if files:
        for upload in files:
            if not upload.filename:
                continue
            await _save_upload(task_id, upload)

    # Compose the headless runner's input.json
    runner_input = {
        "prompt": spec.prompt,
        "model": spec.model or settings.default_model,
        "system_prompt_suffix": spec.system_prompt_suffix or "",
        "max_iterations": spec.max_iterations,
        "max_tokens": spec.max_tokens,
        "tool_version": spec.tool_version,
        "only_n_most_recent_images": spec.only_n_most_recent_images,
        "thinking_budget": spec.thinking_budget,
        "provider": spec.provider,
    }
    storage.write_input_json(task_id, runner_input)

    with session_scope() as db:
        task = Task(
            id=task_id,
            status=TaskStatus.QUEUED.value,
            prompt=spec.prompt,
            model=runner_input["model"],
            spec={
                "env": sanitized_env,
                "max_iterations": spec.max_iterations,
                "tool_version": spec.tool_version,
            },
            timeout_seconds=spec.timeout_seconds,
        )
        db.add(task)
        db.flush()
        response = _to_response(task, request)

    return JSONResponse(status_code=201, content=response.model_dump(mode="json"))


async def _save_upload(task_id: str, upload: UploadFile) -> Path:
    target = storage.files_dir(task_id) / Path(upload.filename or "upload").name
    written = 0
    with target.open("wb") as f:
        while True:
            chunk = await upload.read(1024 * 1024)
            if not chunk:
                break
            written += len(chunk)
            if written > MAX_UPLOAD_BYTES:
                target.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail=f"file {upload.filename!r} exceeds size cap")
            f.write(chunk)
    return target


@router.get("/tasks/{task_id}", response_model=TaskResponse)
def get_task(task_id: str, request: Request) -> TaskResponse:
    with session_scope() as db:
        task = db.get(Task, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="task not found")
        return _to_response(task, request)


@router.get("/tasks", response_model=list[TaskResponse])
def list_tasks(request: Request, limit: int = 50) -> list[TaskResponse]:
    limit = max(1, min(limit, 500))
    with session_scope() as db:
        rows = db.execute(
            select(Task).order_by(Task.created_at.desc()).limit(limit)
        ).scalars().all()
        return [_to_response(t, request) for t in rows]


@router.delete("/tasks/{task_id}", status_code=202)
def cancel_task(task_id: str, request: Request) -> dict:
    with session_scope() as db:
        task = db.get(Task, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="task not found")
        if TaskStatus(task.status) in TERMINAL_STATUSES:
            return {"id": task.id, "status": task.status, "cancelled": False}

    runner = request.app.state.task_runner
    runner.request_cancel(task_id)
    return {"id": task_id, "status": "cancelling", "cancelled": True}


class TaskExtendRequest(BaseModel):
    """Body for ``PATCH /tasks/{task_id}``.

    The task runner re-reads ``timeout_seconds`` from the DB every couple
    of seconds while a container is running, so simply bumping the value
    here is enough to extend the wall-clock deadline.
    """

    extra_seconds: int = Field(
        ..., ge=30, le=24 * 3600, description="Seconds to add to the existing budget"
    )


@router.patch("/tasks/{task_id}")
def extend_task(task_id: str, body: TaskExtendRequest, request: Request) -> dict:
    """Extend a running task's timeout budget.

    Adds ``extra_seconds`` to the row's ``timeout_seconds``. The runner
    will pick the new value up on its next 2-second tick. Has no effect
    on tasks already in a terminal status.
    """
    with session_scope() as db:
        task = db.get(Task, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="task not found")
        if TaskStatus(task.status) in TERMINAL_STATUSES:
            raise HTTPException(
                status_code=409,
                detail=f"task is already {task.status}; cannot extend",
            )
        old = task.timeout_seconds
        task.timeout_seconds = old + body.extra_seconds
        new = task.timeout_seconds

    logger.info(
        "task %s timeout extended by %ds (was %ds, now %ds)",
        task_id,
        body.extra_seconds,
        old,
        new,
    )
    return {
        "id": task_id,
        "previous_timeout_seconds": old,
        "timeout_seconds": new,
        "added_seconds": body.extra_seconds,
    }


@router.get("/tasks/{task_id}/files")
def list_files(task_id: str) -> dict:
    """List every artifact under the task directory.

    Returns paths relative to the task root. Each entry can be downloaded via
    `/tasks/{task_id}/artifacts/{path}`.
    """
    with session_scope() as db:
        if db.get(Task, task_id) is None:
            raise HTTPException(status_code=404, detail="task not found")

    base = storage.task_dir(task_id).resolve()
    if not base.exists():
        return {"task_id": task_id, "files": []}

    files = []
    for p in sorted(base.rglob("*")):
        if not p.is_file():
            continue
        try:
            rel = p.relative_to(base)
        except ValueError:
            continue
        try:
            size = p.stat().st_size
        except OSError:
            size = -1
        files.append({"path": str(rel), "size": size})
    return {"task_id": task_id, "files": files}


@router.get("/tasks/{task_id}/artifacts/{name:path}")
def get_artifact(task_id: str, name: str) -> FileResponse:
    """Download a per-task file under output/, screenshots/, or logs/."""
    # Normalize and prevent path traversal
    base = storage.task_dir(task_id).resolve()
    target = (base / name).resolve()
    if not str(target).startswith(str(base)):
        raise HTTPException(status_code=400, detail="invalid path")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="artifact not found")
    return FileResponse(target)
