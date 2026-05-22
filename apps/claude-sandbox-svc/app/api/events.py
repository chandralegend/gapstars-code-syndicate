"""Server-Sent Events stream of a task's trace.jsonl.

Tails the per-task trace file so a UI/curl client can watch the agent work in
real time without polling the whole task object. Closes when the task reaches
a terminal status and the trace file's tail has been delivered.
"""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, HTTPException, Request
from starlette.responses import StreamingResponse

from app.core import storage
from app.core.models import TERMINAL_STATUSES, Task, TaskStatus
from app.db import session_scope

logger = logging.getLogger(__name__)
router = APIRouter()


def _format_event(data: dict, *, event: str | None = None) -> bytes:
    out = []
    if event:
        out.append(f"event: {event}")
    payload = json.dumps(data)
    # Split multi-line JSON across `data:` lines per SSE spec.
    for line in payload.splitlines() or [""]:
        out.append(f"data: {line}")
    out.append("")
    out.append("")
    return ("\n".join(out)).encode("utf-8")


def _task_terminal(task_id: str) -> bool:
    with session_scope() as db:
        task = db.get(Task, task_id)
        if task is None:
            return True
        return TaskStatus(task.status) in TERMINAL_STATUSES


@router.get("/tasks/{task_id}/events")
async def task_events(task_id: str, request: Request) -> StreamingResponse:
    """Server-Sent-Events stream of trace records for `task_id`."""
    with session_scope() as db:
        task = db.get(Task, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="task not found")
        initial_status = task.status

    trace_file = storage.trace_path(task_id)

    async def gen():
        # Open lazily; the file may not exist yet if the task hasn't started.
        yield _format_event(
            {"task_id": task_id, "status": initial_status}, event="status"
        )

        f = None
        last_size = 0
        try:
            while True:
                if await request.is_disconnected():
                    return

                if f is None and trace_file.exists():
                    f = trace_file.open("r")

                if f is not None:
                    while True:
                        line = f.readline()
                        if not line:
                            break
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            record = json.loads(line)
                        except json.JSONDecodeError:
                            record = {"raw": line}
                        yield _format_event(record, event=record.get("kind", "trace"))

                # If the task is terminal AND we've drained, emit final status and stop.
                if _task_terminal(task_id):
                    # Drain any final newly-written bytes.
                    if f is not None:
                        while True:
                            line = f.readline()
                            if not line:
                                break
                            line = line.strip()
                            if not line:
                                continue
                            try:
                                record = json.loads(line)
                            except json.JSONDecodeError:
                                record = {"raw": line}
                            yield _format_event(record, event=record.get("kind", "trace"))
                    with session_scope() as db:
                        t = db.get(Task, task_id)
                        final_status = t.status if t else "unknown"
                    yield _format_event(
                        {"task_id": task_id, "status": final_status}, event="end"
                    )
                    return

                await asyncio.sleep(0.5)
        finally:
            if f is not None:
                f.close()

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
