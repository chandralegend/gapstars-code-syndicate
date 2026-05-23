"""Filesystem layout helpers for per-task input/output."""

from __future__ import annotations

import io
import json
import shutil
import zipfile
from pathlib import Path

from app.core.config import get_settings


def task_dir(task_id: str) -> Path:
    return get_settings().tasks_dir / task_id


def input_dir(task_id: str) -> Path:
    return task_dir(task_id) / "input"


def files_dir(task_id: str) -> Path:
    return task_dir(task_id) / "input" / "files"


def output_dir(task_id: str) -> Path:
    return task_dir(task_id) / "output"


def screenshots_dir(task_id: str) -> Path:
    return output_dir(task_id) / "screenshots"


def logs_dir(task_id: str) -> Path:
    return task_dir(task_id) / "logs"


def init_task_layout(task_id: str) -> Path:
    """Create the directory structure for a new task and return its root."""
    root = task_dir(task_id)
    for sub in (input_dir, files_dir, output_dir, screenshots_dir, logs_dir):
        sub(task_id).mkdir(parents=True, exist_ok=True)
    return root


def write_input_json(task_id: str, payload: dict) -> Path:
    """Write the input.json the headless runner consumes inside the container."""
    target = task_dir(task_id) / "input.json"
    target.write_text(json.dumps(payload, indent=2))
    return target


def read_output_json(task_id: str, name: str) -> dict | None:
    path = output_dir(task_id) / name
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return None


def trace_path(task_id: str) -> Path:
    return output_dir(task_id) / "trace.jsonl"


def container_log_path(task_id: str) -> Path:
    return logs_dir(task_id) / "container.log"


def remove_task_dir(task_id: str) -> None:
    root = task_dir(task_id)
    if root.exists():
        shutil.rmtree(root, ignore_errors=True)


def list_task_files(task_id: str) -> list[Path]:
    root = task_dir(task_id)
    if not root.exists():
        return []
    return sorted(p for p in root.rglob("*") if p.is_file())


def workspace_dir(task_id: str) -> Path:
    return output_dir(task_id) / "workspace"


def bundle_dir(task_id: str) -> Path:
    """Where execution-kind tasks expect to read their bundle from.

    Inside the running container this maps to ``/task/input/bundle/``;
    `run_bundle.sh` cd's into it and runs ``./run.sh``.
    """
    return input_dir(task_id) / "bundle"


def copy_bundle_from_source(source_task_id: str, dest_task_id: str) -> Path:
    """Copy a source task's ``output/workspace/`` into the destination
    task's ``input/bundle/`` so a fresh container can find it at the
    canonical bundle path.

    Returns the destination directory. Raises ``FileNotFoundError`` if
    the source workspace doesn't exist (the caller turns that into a
    400/404 for the API consumer).
    """
    src = workspace_dir(source_task_id)
    if not src.exists():
        raise FileNotFoundError(
            f"source workspace not found for task {source_task_id}"
        )
    dest = bundle_dir(dest_task_id)
    shutil.copytree(src, dest, dirs_exist_ok=True)
    return dest


def build_workspace_zip(task_id: str) -> bytes | None:
    """Zip up everything Claude wrote under output/workspace/.

    Returns ``None`` if the workspace dir is missing. Excludes nothing —
    callers can filter at the API layer if they need to.
    """
    ws = workspace_dir(task_id)
    if not ws.exists():
        return None

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(ws.rglob("*")):
            if not path.is_file():
                continue
            try:
                rel = path.relative_to(ws)
            except ValueError:
                continue
            zf.write(path, arcname=str(rel))
    return buf.getvalue()
