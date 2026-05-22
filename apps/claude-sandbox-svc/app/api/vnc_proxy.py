"""noVNC viewer + reverse proxy.

The viewer is an iframe that loads `/tasks/{id}/vnc/vnc.html?token=...`. The
proxy forwards both HTTP (static assets) and WebSocket traffic through to the
sandbox container's noVNC server on 127.0.0.1:{vnc_port}. Every request is
gated by an HMAC token bound to the task id.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx
import websockets
from fastapi import APIRouter, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, Response
from starlette.websockets import WebSocketState

from app.core import tokens
from app.core.config import get_settings
from app.core.models import Task, TaskStatus
from app.db import session_scope


@dataclass
class _ViewableTask:
    id: str
    status: str
    vnc_port: int

logger = logging.getLogger(__name__)
router = APIRouter()


# Headers we strip when proxying (hop-by-hop or set by httpx itself).
_HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
    "content-encoding",
}


def _verify(task_id: str, token: str) -> None:
    try:
        tokens.verify(token, expected_task_id=task_id)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=f"bad token: {e}") from e


def _verify_ws(task_id: str, token: str | None) -> bool:
    if not token:
        return False
    try:
        tokens.verify(token, expected_task_id=task_id)
        return True
    except ValueError:
        return False


def _viewable_task(task_id: str) -> _ViewableTask:
    with session_scope() as db:
        task = db.get(Task, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="task not found")
        if task.vnc_port is None or task.status not in {
            TaskStatus.RUNNING.value,
            TaskStatus.STARTING.value,
        }:
            raise HTTPException(
                status_code=409, detail=f"sandbox not viewable (status={task.status})"
            )
        return _ViewableTask(id=task.id, status=task.status, vnc_port=int(task.vnc_port))


@router.get("/tasks/{task_id}/viewer", response_class=HTMLResponse)
def viewer(task_id: str, token: str = Query(...)) -> HTMLResponse:
    _verify(task_id, token)
    task = _viewable_task(task_id)

    settings = get_settings()
    if settings.vnc_proxy_mode == "direct":
        target = (
            f"http://{settings.vnc_bind_host}:{task.vnc_port}"
            f"/vnc.html?autoconnect=1&resize=scale"
        )
    else:
        qs = urlencode(
            {
                "autoconnect": 1,
                "resize": "scale",
                "path": f"tasks/{task_id}/vnc/websockify?token={token}",
                "token": token,
            }
        )
        target = f"/tasks/{task_id}/vnc/vnc.html?{qs}"

    html = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Sandbox {task_id[:8]} live view</title></head>
<body style="margin:0;background:#000">
<iframe src="{target}" style="border:0;width:100vw;height:100vh"></iframe>
</body></html>
"""
    return HTMLResponse(html)


# ---- HTTP proxy --------------------------------------------------------------


@router.api_route(
    "/tasks/{task_id}/vnc/{path:path}",
    methods=["GET", "HEAD"],
    operation_id="vnc_http_proxy",
    include_in_schema=False,
)
async def vnc_http_proxy(task_id: str, path: str, request: Request, token: str = Query(...)):
    """Proxy HTTP requests for noVNC's static assets.

    We deliberately do NOT proxy POST/PUT here -- noVNC only does GETs for
    static files; everything else flows through the websocket.
    """
    _verify(task_id, token)
    task = _viewable_task(task_id)

    settings = get_settings()
    upstream = f"http://{settings.vnc_bind_host}:{task.vnc_port}/{path}"
    # Forward the original querystring minus our token.
    forward_qs = {k: v for k, v in request.query_params.items() if k != "token"}

    headers = {
        k: v for k, v in request.headers.items() if k.lower() not in _HOP_BY_HOP
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.request(
                request.method,
                upstream,
                params=forward_qs,
                headers=headers,
                content=await request.body(),
            )
    except httpx.RequestError as e:
        logger.warning("vnc proxy fetch failed task=%s path=%s err=%s", task_id, path, e)
        raise HTTPException(status_code=502, detail="upstream noVNC not reachable") from e

    response_headers = {
        k: v for k, v in r.headers.items() if k.lower() not in _HOP_BY_HOP
    }
    return Response(content=r.content, status_code=r.status_code, headers=response_headers)


# ---- WebSocket proxy ---------------------------------------------------------


@router.websocket("/tasks/{task_id}/vnc/websockify")
async def vnc_ws_proxy(websocket: WebSocket, task_id: str):
    token = websocket.query_params.get("token")
    if not _verify_ws(task_id, token):
        await websocket.close(code=4403)
        return

    try:
        task = _viewable_task(task_id)
    except HTTPException as e:
        await websocket.close(code=4404 if e.status_code == 404 else 4409)
        return

    settings = get_settings()
    upstream_url = f"ws://{settings.vnc_bind_host}:{task.vnc_port}/websockify"

    # Negotiate the noVNC binary subprotocol.
    requested = websocket.scope.get("subprotocols") or []
    chosen = "binary" if "binary" in requested else None
    await websocket.accept(subprotocol=chosen)

    subprotocols = ["binary"] if chosen else None

    try:
        async with websockets.connect(
            upstream_url, subprotocols=subprotocols, max_size=None
        ) as upstream:
            await _bridge_ws(websocket, upstream)
    except (websockets.exceptions.WebSocketException, OSError) as e:
        logger.warning("vnc ws upstream failed task=%s err=%s", task_id, e)
        if websocket.client_state is WebSocketState.CONNECTED:
            await websocket.close(code=1011)


async def _bridge_ws(client_ws: WebSocket, upstream) -> None:
    """Pump messages in both directions until either side closes."""

    async def client_to_upstream():
        try:
            while True:
                msg = await client_ws.receive()
                if msg.get("type") == "websocket.disconnect":
                    return
                if (data := msg.get("bytes")) is not None:
                    await upstream.send(data)
                elif (text := msg.get("text")) is not None:
                    await upstream.send(text)
        except WebSocketDisconnect:
            return

    async def upstream_to_client():
        try:
            async for message in upstream:
                if isinstance(message, bytes):
                    await client_ws.send_bytes(message)
                else:
                    await client_ws.send_text(message)
        except websockets.exceptions.ConnectionClosed:
            return

    a = asyncio.create_task(client_to_upstream())
    b = asyncio.create_task(upstream_to_client())
    done, pending = await asyncio.wait({a, b}, return_when=asyncio.FIRST_COMPLETED)
    for t in pending:
        t.cancel()
    try:
        await upstream.close()
    except Exception:
        pass
    if client_ws.client_state is WebSocketState.CONNECTED:
        await client_ws.close()
