from __future__ import annotations

import json
import logging
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from api.agent.graph import build_graph

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])


# ── Request / Response schemas ────────────────────────────────────────────────


class ChatRequest(BaseModel):
    message: str = Field(..., description="User message text")
    thread_id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        description="Conversation thread ID. Reuse the same ID to continue a conversation.",
    )


class ChatResponse(BaseModel):
    thread_id: str
    content: str


# ── Helpers ───────────────────────────────────────────────────────────────────


def _get_graph(request):
    """Retrieve the compiled graph attached to the app state."""
    return request.app.state.graph


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("", response_model=ChatResponse, summary="Send a message and get a full response")
async def chat(body: ChatRequest, request: __import__("fastapi").Request):
    """Invoke the agent and return the complete response as JSON."""
    graph = _get_graph(request)
    config = {"configurable": {"thread_id": body.thread_id}}

    result = await graph.ainvoke(
        {"messages": [HumanMessage(content=body.message)]},
        config=config,
    )

    last_message = result["messages"][-1]
    return ChatResponse(thread_id=body.thread_id, content=last_message.content)


@router.post("/stream", summary="Send a message and stream the response via SSE")
async def chat_stream(body: ChatRequest, request: __import__("fastapi").Request):
    """Invoke the agent and stream tokens back as Server-Sent Events.

    Each SSE event has one of the following types:
    - ``token``  — a partial text token from the model
    - ``done``   — final event, data contains ``{"thread_id": "..."}``
    - ``error``  — data contains ``{"detail": "..."}``
    """
    graph = _get_graph(request)
    config = {"configurable": {"thread_id": body.thread_id}}

    async def event_generator() -> AsyncGenerator[dict, None]:
        try:
            async for event in graph.astream_events(
                {"messages": [HumanMessage(content=body.message)]},
                config=config,
                version="v2",
            ):
                kind = event["event"]
                # Stream individual tokens from the model
                if kind == "on_chat_model_stream":
                    chunk = event["data"].get("chunk")
                    if chunk and chunk.content:
                        yield {
                            "event": "token",
                            "data": json.dumps({"token": chunk.content}),
                        }

            yield {
                "event": "done",
                "data": json.dumps({"thread_id": body.thread_id}),
            }
        except Exception as exc:
            logger.exception("Error during agent stream")
            yield {
                "event": "error",
                "data": json.dumps({"detail": str(exc)}),
            }

    return EventSourceResponse(event_generator())
