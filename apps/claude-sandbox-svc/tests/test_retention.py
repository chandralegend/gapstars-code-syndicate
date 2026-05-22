from datetime import datetime, timedelta, timezone

from app.core import storage
from app.core.models import Task, TaskStatus
from app.core.retention import sweep_once
from app.db import session_scope


def _seed(task_id: str, *, status: TaskStatus, finished_days_ago: int | None) -> None:
    storage.init_task_layout(task_id)
    finished_at = (
        datetime.now(timezone.utc) - timedelta(days=finished_days_ago)
        if finished_days_ago is not None
        else None
    )
    with session_scope() as db:
        db.add(
            Task(
                id=task_id,
                status=status.value,
                prompt="p",
                model="m",
                spec={},
                timeout_seconds=60,
                finished_at=finished_at,
            )
        )


def test_sweep_removes_old_terminal_tasks(monkeypatch):
    monkeypatch.setenv("RETENTION_DAYS", "7")
    from app.core import config as cfg

    cfg.get_settings.cache_clear()

    _seed("old-success", status=TaskStatus.SUCCEEDED, finished_days_ago=10)
    _seed("recent-success", status=TaskStatus.SUCCEEDED, finished_days_ago=1)
    _seed("running", status=TaskStatus.RUNNING, finished_days_ago=None)

    removed = sweep_once()
    assert removed == 1

    with session_scope() as db:
        assert db.get(Task, "old-success") is None
        assert db.get(Task, "recent-success") is not None
        assert db.get(Task, "running") is not None

    assert not storage.task_dir("old-success").exists()
    assert storage.task_dir("recent-success").exists()


def test_sweep_disabled_when_retention_zero(monkeypatch):
    monkeypatch.setenv("RETENTION_DAYS", "0")
    from app.core import config as cfg

    cfg.get_settings.cache_clear()

    _seed("old-success", status=TaskStatus.SUCCEEDED, finished_days_ago=999)
    assert sweep_once() == 0
    with session_scope() as db:
        assert db.get(Task, "old-success") is not None
