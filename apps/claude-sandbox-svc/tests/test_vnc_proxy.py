"""Tests for the noVNC viewer + reverse-proxy endpoints.

We don't spin up a real noVNC upstream here -- those are integration tests.
Instead we cover the auth + state-validation surface, which is where bugs
that matter live.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core import tokens


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


def _set_running(task_id: str, port: int = 6080) -> None:
    from app.core.models import Task, TaskStatus
    from app.db import session_scope

    with session_scope() as db:
        t = db.get(Task, task_id)
        assert t is not None
        t.status = TaskStatus.RUNNING.value
        t.vnc_port = port


def _create_task(client) -> str:
    import json

    r = client.post(
        "/tasks",
        data={"data": json.dumps({"prompt": "hi", "max_iterations": 1, "timeout_seconds": 60})},
    )
    return r.json()["id"]


def test_viewer_requires_token(client):
    task_id = _create_task(client)
    r = client.get(f"/tasks/{task_id}/viewer")
    assert r.status_code == 422  # missing required `token` query param


def test_viewer_rejects_bad_token(client):
    task_id = _create_task(client)
    r = client.get(f"/tasks/{task_id}/viewer?token=garbage")
    assert r.status_code == 403


def test_viewer_rejects_token_for_other_task(client):
    a = _create_task(client)
    b = _create_task(client)
    tok = tokens.issue(b)
    _set_running(a)
    r = client.get(f"/tasks/{a}/viewer?token={tok}")
    assert r.status_code == 403


def test_viewer_409_when_task_not_viewable(client):
    task_id = _create_task(client)  # still queued, no vnc port
    tok = tokens.issue(task_id)
    r = client.get(f"/tasks/{task_id}/viewer?token={tok}")
    assert r.status_code == 409


def test_viewer_renders_iframe_when_running(client):
    task_id = _create_task(client)
    _set_running(task_id)
    tok = tokens.issue(task_id)
    r = client.get(f"/tasks/{task_id}/viewer?token={tok}")
    assert r.status_code == 200
    assert "iframe" in r.text
    # In default proxy mode, the iframe should point at our /vnc/ path.
    assert f"/tasks/{task_id}/vnc/" in r.text


def test_http_proxy_rejects_bad_token(client):
    task_id = _create_task(client)
    _set_running(task_id)
    r = client.get(f"/tasks/{task_id}/vnc/vnc.html?token=garbage")
    assert r.status_code == 403


def test_http_proxy_502_when_upstream_unreachable(client):
    """With the task marked running but no real container, the upstream connect should fail cleanly."""
    task_id = _create_task(client)
    _set_running(task_id, port=1)  # port 1 -> connect refused
    tok = tokens.issue(task_id)
    r = client.get(f"/tasks/{task_id}/vnc/vnc.html?token={tok}")
    assert r.status_code == 502
