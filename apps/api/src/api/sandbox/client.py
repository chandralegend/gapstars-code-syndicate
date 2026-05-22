"""Async HTTP client for the claude-sandbox-svc.

Wraps the small slice of the sandbox HTTP API we need from inside Agent 2:
create a task, poll it to completion, and read its artifacts.

The sandbox runs at ``settings.sandbox_base_url`` (e.g.
``http://claude-sandbox-svc:8000`` inside docker-compose, or
``http://localhost:8100`` from the host).
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

import httpx

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SandboxTaskState:
    id: str
    status: str  # "queued" | "starting" | "running" | "succeeded" | "failed" | "timeout" | "cancelled"
    error: str | None
    started_at: str | None
    finished_at: str | None
    result: dict[str, Any] | None
    vnc_url: str | None
    artifacts_url: str | None


TERMINAL_STATUSES: frozenset[str] = frozenset(
    {"succeeded", "failed", "timeout", "cancelled"}
)


class SandboxClient:
    """Thin async wrapper around the sandbox HTTP API.

    Use as ``async with SandboxClient(base_url) as client:``.
    """

    def __init__(self, base_url: str, timeout_seconds: float = 30.0):
        self._base = base_url.rstrip("/")
        self._client = httpx.AsyncClient(
            base_url=self._base,
            timeout=httpx.Timeout(timeout_seconds),
        )

    async def __aenter__(self) -> "SandboxClient":
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._client.aclose()

    # ── Task lifecycle ──────────────────────────────────────────────────────

    async def create_task(
        self,
        *,
        prompt: str,
        model: str | None = None,
        system_prompt_suffix: str = "",
        timeout_seconds: int = 1800,
        max_iterations: int = 50,
        env: dict[str, str] | None = None,
    ) -> str:
        """Create a sandbox task and return its id.

        The body is sent as ``multipart/form-data`` because that's what
        ``POST /tasks`` requires (it accepts file uploads alongside the JSON
        ``data`` part). We send only the JSON part.
        """
        spec: dict[str, Any] = {
            "prompt": prompt,
            "system_prompt_suffix": system_prompt_suffix,
            "timeout_seconds": timeout_seconds,
            "max_iterations": max_iterations,
            "env": env or {},
        }
        if model:
            spec["model"] = model

        # `data` is the JSON-encoded TaskCreate body, sent as a form field.
        response = await self._client.post(
            "/tasks",
            data={"data": json.dumps(spec)},
        )
        if response.status_code >= 400:
            raise SandboxError(
                f"sandbox create_task failed: {response.status_code} {response.text}"
            )

        body = response.json()
        task_id = body.get("id")
        if not task_id:
            raise SandboxError(f"sandbox create_task returned no id: {body}")
        return str(task_id)

    async def get_task(self, task_id: str) -> SandboxTaskState:
        response = await self._client.get(f"/tasks/{task_id}")
        if response.status_code == 404:
            raise SandboxError(f"sandbox task {task_id} not found")
        if response.status_code >= 400:
            raise SandboxError(
                f"sandbox get_task failed: {response.status_code} {response.text}"
            )
        body = response.json()
        return SandboxTaskState(
            id=body["id"],
            status=body["status"],
            error=body.get("error"),
            started_at=body.get("started_at"),
            finished_at=body.get("finished_at"),
            result=body.get("result"),
            vnc_url=body.get("vnc_url"),
            artifacts_url=body.get("artifacts_url"),
        )

    async def cancel_task(self, task_id: str) -> None:
        response = await self._client.delete(f"/tasks/{task_id}")
        # 202 = cancellation requested; 404 = already gone — both fine.
        if response.status_code not in (200, 202, 404):
            raise SandboxError(
                f"sandbox cancel_task failed: {response.status_code} {response.text}"
            )

    # ── Artifact access ─────────────────────────────────────────────────────

    async def list_files(self, task_id: str) -> list[dict[str, Any]]:
        response = await self._client.get(f"/tasks/{task_id}/files")
        if response.status_code == 404:
            return []
        if response.status_code >= 400:
            raise SandboxError(
                f"sandbox list_files failed: {response.status_code} {response.text}"
            )
        return response.json().get("files", [])

    async def read_artifact_text(
        self,
        task_id: str,
        path: str,
        *,
        max_bytes: int = 256 * 1024,
    ) -> str | None:
        """Fetch a text artifact under the task directory.

        Returns ``None`` if the artifact is missing. Truncates the body at
        ``max_bytes`` to keep node memory bounded.
        """
        try:
            response = await self._client.get(f"/tasks/{task_id}/artifacts/{path}")
        except httpx.HTTPError as exc:
            raise SandboxError(f"sandbox artifact {path}: {exc}") from exc
        if response.status_code == 404:
            return None
        if response.status_code >= 400:
            raise SandboxError(
                f"sandbox artifact {path}: {response.status_code} {response.text}"
            )
        content = response.content[:max_bytes]
        try:
            return content.decode("utf-8", errors="replace")
        except Exception as exc:  # pragma: no cover — defensive
            logger.warning("could not decode artifact %s: %s", path, exc)
            return None

    async def read_artifact_bytes(
        self,
        task_id: str,
        path: str,
    ) -> tuple[bytes, str] | None:
        """Fetch a binary artifact (e.g. a screenshot) verbatim.

        Returns ``(bytes, content_type)`` or ``None`` if the artifact is
        missing.
        """
        try:
            response = await self._client.get(f"/tasks/{task_id}/artifacts/{path}")
        except httpx.HTTPError as exc:
            raise SandboxError(f"sandbox artifact {path}: {exc}") from exc
        if response.status_code == 404:
            return None
        if response.status_code >= 400:
            raise SandboxError(
                f"sandbox artifact {path}: {response.status_code} {response.text}"
            )
        content_type = response.headers.get("content-type", "application/octet-stream")
        return response.content, content_type


class SandboxError(RuntimeError):
    """Raised when the sandbox HTTP API returns an error or behaves unexpectedly."""
