"""End-to-end API tests with the docker layer mocked out.

We patch the task runner to never actually start a container, then exercise
the HTTP surface (POST/GET/DELETE/list/artifacts).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    # Patch out docker_manager + the runner so we don't touch Docker.
    from app.core import docker_manager, task_runner

    def _noop(*a, **kw):
        pass

    monkeypatch.setattr(docker_manager, "sweep_orphans", lambda: 0)

    # Replace the task runner with a no-op so background loops don't run.
    class _StubRunner:
        def __init__(self, *a, **kw):
            pass

        async def start(self):
            return None

        async def stop(self):
            return None

        def request_cancel(self, task_id):
            self.last_cancel = task_id

    monkeypatch.setattr(task_runner, "TaskRunner", _StubRunner)

    # Import app AFTER patches so lifespan uses the stub.
    from app.main import app

    with TestClient(app) as c:
        yield c


def _make(prompt: str = "Open example.com") -> dict:
    return {
        "data": json.dumps(
            {
                "prompt": prompt,
                "max_iterations": 5,
                "timeout_seconds": 60,
            }
        )
    }


def test_healthz(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_create_task_returns_id_and_queued_status(client):
    r = client.post("/tasks", data=_make())
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "queued"
    assert body["id"]
    assert body["prompt"] == "Open example.com"
    assert body["model"]  # default applied


def test_get_task_404(client):
    r = client.get("/tasks/does-not-exist")
    assert r.status_code == 404


def test_get_task_round_trips(client):
    created = client.post("/tasks", data=_make("hello")).json()
    r = client.get(f"/tasks/{created['id']}")
    assert r.status_code == 200
    assert r.json()["id"] == created["id"]


def test_list_tasks_returns_recent(client):
    ids = [client.post("/tasks", data=_make(f"p{i}")).json()["id"] for i in range(3)]
    r = client.get("/tasks?limit=10")
    assert r.status_code == 200
    listed = r.json()
    assert {t["id"] for t in listed} >= set(ids)


def test_create_with_invalid_json_400(client):
    r = client.post("/tasks", data={"data": "{not-json"})
    assert r.status_code == 400


def test_create_with_missing_prompt_422(client):
    r = client.post("/tasks", data={"data": json.dumps({"max_iterations": 1})})
    assert r.status_code == 422


def test_cancel_queued_task(client):
    created = client.post("/tasks", data=_make()).json()
    r = client.delete(f"/tasks/{created['id']}")
    assert r.status_code == 202
    assert r.json()["cancelled"] is True


def test_cancel_unknown_task_404(client):
    r = client.delete("/tasks/missing")
    assert r.status_code == 404


def test_artifact_traversal_blocked(client):
    created = client.post("/tasks", data=_make()).json()
    r = client.get(f"/tasks/{created['id']}/artifacts/../../etc/passwd")
    assert r.status_code in (400, 404)


def test_create_with_blocked_env_var_400(client):
    r = client.post(
        "/tasks",
        data={
            "data": json.dumps(
                {
                    "prompt": "p",
                    "env": {"AWS_SECRET_ACCESS_KEY": "leak"},
                }
            )
        },
    )
    assert r.status_code == 400


def test_create_with_task_prefixed_env_ok(client):
    r = client.post(
        "/tasks",
        data={
            "data": json.dumps(
                {
                    "prompt": "p",
                    "env": {"TASK_TARGET_URL": "https://staging.example.com"},
                }
            )
        },
    )
    assert r.status_code == 201


def test_files_lists_task_artifacts(client, tmp_path):
    # Create a task, then drop a file under its output/workspace dir to
    # simulate something the agent produced.
    from app.core import storage

    created = client.post("/tasks", data=_make()).json()
    tid = created["id"]
    workspace = storage.output_dir(tid) / "workspace"
    workspace.mkdir(parents=True, exist_ok=True)
    (workspace / "summary.md").write_text("# hi")

    r = client.get(f"/tasks/{tid}/files")
    assert r.status_code == 200
    body = r.json()
    paths = {f["path"] for f in body["files"]}
    assert "input.json" in paths
    assert "output/workspace/summary.md" in paths


def test_files_unknown_task_404(client):
    r = client.get("/tasks/missing/files")
    assert r.status_code == 404


def test_artifact_download_workspace_file(client):
    from app.core import storage

    created = client.post("/tasks", data=_make()).json()
    tid = created["id"]
    workspace = storage.output_dir(tid) / "workspace"
    workspace.mkdir(parents=True, exist_ok=True)
    (workspace / "summary.md").write_text("# hello world")

    r = client.get(f"/tasks/{tid}/artifacts/output/workspace/summary.md")
    assert r.status_code == 200
    assert r.text == "# hello world"
