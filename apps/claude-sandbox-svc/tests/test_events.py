import json

import pytest
from fastapi.testclient import TestClient

from app.core import storage
from app.core.models import Task, TaskStatus
from app.db import session_scope


@pytest.fixture
def client(monkeypatch):
    from app.core import docker_manager, task_runner

    monkeypatch.setattr(docker_manager, "sweep_orphans", lambda: 0)

    class _StubRunner:
        def __init__(self, *a, **kw):
            pass

        async def start(self):
            return None

        async def stop(self):
            return None

        def request_cancel(self, task_id):
            pass

    monkeypatch.setattr(task_runner, "TaskRunner", _StubRunner)

    from app.main import app

    with TestClient(app) as c:
        yield c


def _seed_terminal_task_with_trace(task_id: str, records: list[dict]) -> None:
    storage.init_task_layout(task_id)
    trace = storage.trace_path(task_id)
    with trace.open("w") as f:
        for r in records:
            f.write(json.dumps(r) + "\n")
    with session_scope() as db:
        db.add(
            Task(
                id=task_id,
                status=TaskStatus.SUCCEEDED.value,
                prompt="p",
                model="m",
                spec={},
                timeout_seconds=60,
            )
        )


def test_events_unknown_task_404(client):
    r = client.get("/tasks/missing/events")
    assert r.status_code == 404


def test_events_streams_trace_and_terminates(client):
    _seed_terminal_task_with_trace(
        "t-1",
        [
            {"kind": "run_start", "model": "m"},
            {"kind": "tool_use", "name": "computer", "id": "1"},
            {"kind": "run_end", "status": "succeeded"},
        ],
    )
    with client.stream("GET", "/tasks/t-1/events") as r:
        assert r.status_code == 200
        body = r.read().decode("utf-8")

    assert "event: status" in body
    assert "event: run_start" in body
    assert "event: tool_use" in body
    assert "event: run_end" in body
    assert "event: end" in body
