"""Thin wrapper around docker-py for sandbox lifecycle management.

All Docker calls live here so the rest of the app stays testable. The Docker
SDK is sync; we run blocking calls on a thread when invoked from async code.
"""

from __future__ import annotations

import logging
import socket
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import docker
from docker.errors import APIError, NotFound
from docker.models.containers import Container

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)

CONTAINER_NAME_PREFIX = "sandbox-"
MANAGED_LABEL = "claude-sandbox-svc.managed"
TASK_ID_LABEL = "claude-sandbox-svc.task_id"


@dataclass
class StartedContainer:
    container_id: str
    container_name: str
    vnc_port: int


class DockerUnavailable(RuntimeError):
    pass


def _client() -> docker.DockerClient:
    try:
        return docker.from_env()
    except Exception as e:  # pragma: no cover - depends on env
        raise DockerUnavailable(f"cannot connect to docker daemon: {e}") from e


def _pick_free_port(host: str = "127.0.0.1") -> int:
    """Ask the kernel for a free TCP port. Race-y but fine for low concurrency."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((host, 0))
        return s.getsockname()[1]


def container_name_for(task_id: str) -> str:
    return f"{CONTAINER_NAME_PREFIX}{task_id}"


def ensure_image(image: str | None = None) -> None:
    """Verify the sandbox image is present locally; raise if missing.

    We don't auto-pull because the image is built locally from docker/Dockerfile.
    """
    settings = get_settings()
    image = image or settings.sandbox_image
    client = _client()
    try:
        client.images.get(image)
    except NotFound as e:
        raise DockerUnavailable(
            f"sandbox image '{image}' not found. Run scripts/build_image.sh first."
        ) from e


def start_sandbox(
    *,
    task_id: str,
    task_dir: Path,
    user_env: dict[str, str] | None = None,
    settings: Settings | None = None,
) -> StartedContainer:
    """Run the sandbox container for a task and return its identifiers."""
    settings = settings or get_settings()
    client = _client()

    name = container_name_for(task_id)
    vnc_port = _pick_free_port(settings.vnc_bind_host)

    env: dict[str, str] = {
        "ANTHROPIC_API_KEY": settings.anthropic_api_key,
        "WIDTH": str(settings.width),
        "HEIGHT": str(settings.height),
        "TASK_ID": task_id,
        "TASK_DIR": "/task",
    }
    # user-supplied env (whitelisted by the API layer; passed through here).
    if user_env:
        env.update({k: str(v) for k, v in user_env.items()})

    # Convert "1.5" CPUs to nano CPUs.
    nano_cpus = int(float(settings.sandbox_cpus) * 1_000_000_000)

    try:
        container: Container = client.containers.run(
            image=settings.sandbox_image,
            name=name,
            detach=True,
            environment=env,
            volumes={str(task_dir): {"bind": "/task", "mode": "rw"}},
            ports={"6080/tcp": (settings.vnc_bind_host, vnc_port)},
            mem_limit=settings.sandbox_mem_limit,
            nano_cpus=nano_cpus,
            network=settings.sandbox_network,
            labels={MANAGED_LABEL: "1", TASK_ID_LABEL: task_id},
            auto_remove=False,
        )
    except APIError as e:
        raise DockerUnavailable(f"failed to start sandbox container: {e}") from e

    logger.info("started container %s for task %s on vnc port %d", container.id, task_id, vnc_port)
    return StartedContainer(
        container_id=container.id,
        container_name=name,
        vnc_port=vnc_port,
    )


def stop_sandbox(container_id_or_name: str, *, timeout: int = 10) -> None:
    client = _client()
    try:
        c = client.containers.get(container_id_or_name)
    except NotFound:
        return
    try:
        c.stop(timeout=timeout)
    except APIError as e:
        logger.warning("stop failed for %s: %s", container_id_or_name, e)


def remove_sandbox(container_id_or_name: str, *, force: bool = True) -> None:
    client = _client()
    try:
        c = client.containers.get(container_id_or_name)
    except NotFound:
        return
    try:
        c.remove(force=force)
    except APIError as e:
        logger.warning("remove failed for %s: %s", container_id_or_name, e)


def wait_sandbox(container_id_or_name: str, *, timeout: int | None = None) -> dict[str, Any]:
    """Block until the container exits. Returns the upstream wait dict (StatusCode, ...)."""
    client = _client()
    c = client.containers.get(container_id_or_name)
    return c.wait(timeout=timeout)  # type: ignore[arg-type]


def fetch_logs(container_id_or_name: str) -> bytes:
    client = _client()
    try:
        c = client.containers.get(container_id_or_name)
    except NotFound:
        return b""
    try:
        return c.logs(stdout=True, stderr=True, timestamps=True)
    except APIError as e:
        logger.warning("logs failed for %s: %s", container_id_or_name, e)
        return b""


def sweep_orphans() -> int:
    """Remove any leftover sandbox-* containers from previous runs.

    Returns the number of containers removed.
    """
    try:
        client = _client()
    except DockerUnavailable:
        return 0
    removed = 0
    for c in client.containers.list(all=True, filters={"label": MANAGED_LABEL}):
        try:
            c.remove(force=True)
            removed += 1
        except APIError as e:
            logger.warning("orphan cleanup failed for %s: %s", c.name, e)
    if removed:
        logger.info("removed %d orphan sandbox container(s)", removed)
    return removed
