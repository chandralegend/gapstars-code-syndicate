from __future__ import annotations

import json
import logging
import uuid
from collections.abc import AsyncGenerator

from fastapi import APIRouter
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])

# Agent node names in the graph — used to detect agent switches
_AGENT_NODES = {"triage", "order_support", "technical_support"}

# Tool node names — used to filter tool events to their parent agent
_TOOL_NODES = {"triage_tools", "order_tools", "tech_tools"}


# ── Request / Response schemas ────────────────────────────────────────────────


class ChatRequest(BaseModel):
    message: str = Field(..., description="User message text")
    thread_id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        description=(
            "Conversation thread ID. "
            "Reuse the same ID to continue a conversation."
        ),
    )


class ChatResponse(BaseModel):
    thread_id: str
    content: str
    agent: str | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────


def _get_graph(request):
    """Retrieve the compiled graph attached to the app state."""
    return request.app.state.graph


def _friendly_tool_name(name: str) -> str:
    """Convert a snake_case tool name to a human-friendly label."""
    return name.replace("_", " ").title()


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post(
    "",
    response_model=ChatResponse,
    summary="Send a message and get a full response",
)
async def chat(body: ChatRequest, request: __import__("fastapi").Request):
    """Invoke the agent and return the complete response as JSON."""
    graph = _get_graph(request)
    config = {"configurable": {"thread_id": body.thread_id}}

    result = await graph.ainvoke(
        {"messages": [HumanMessage(content=body.message)]},
        config=config,
    )

    last_message = result["messages"][-1]
    current_agent = result.get("current_agent", "triage")
    return ChatResponse(
        thread_id=body.thread_id,
        content=last_message.content,
        agent=current_agent,
    )


@router.post(
    "/stream",
    summary="Send a message and stream the response via SSE",
)
async def chat_stream(
    body: ChatRequest, request: __import__("fastapi").Request
):
    """Invoke the agent and stream events back as Server-Sent Events.

    Each SSE event has one of the following types:

    - ``agent``       — agent switch, data: ``{"agent": "...", "from": "..."}``
    - ``tool_call``   — tool invocation started, data:
                        ``{"tool": "...", "args": {...}, "agent": "..."}``
    - ``tool_result`` — tool finished, data:
                        ``{"tool": "...", "result": "...", "agent": "..."}``
    - ``token``       — a partial text token from the model
    - ``done``        — final event, data: ``{"thread_id": "..."}``
    - ``error``       — data: ``{"detail": "..."}``
    """
    graph = _get_graph(request)
    config = {"configurable": {"thread_id": body.thread_id}}

    async def event_generator() -> AsyncGenerator[dict, None]:
        try:
            current_agent: str | None = None

            async for event in graph.astream_events(
                {"messages": [HumanMessage(content=body.message)]},
                config=config,
                version="v2",
            ):
                kind = event["event"]
                name = event.get("name", "")

                # ── Agent switches ───────────────────────────────────
                if kind == "on_chain_start" and name in _AGENT_NODES:
                    if name != current_agent:
                        prev_agent = current_agent
                        current_agent = name
                        yield {
                            "event": "agent",
                            "data": json.dumps(
                                {
                                    "agent": current_agent,
                                    "from": prev_agent,
                                }
                            ),
                        }

                # ── Tool calls ───────────────────────────────────────
                if kind == "on_tool_start":
                    tool_name = name
                    tool_input = event["data"].get("input", {})
                    # Truncate large inputs for the UI
                    if isinstance(tool_input, dict):
                        args = {
                            k: (
                                v[:200] + "..."
                                if isinstance(v, str) and len(v) > 200
                                else v
                            )
                            for k, v in tool_input.items()
                        }
                    else:
                        args = {"input": str(tool_input)[:200]}

                    yield {
                        "event": "tool_call",
                        "data": json.dumps(
                            {
                                "tool": tool_name,
                                "tool_label": _friendly_tool_name(
                                    tool_name
                                ),
                                "args": args,
                                "agent": current_agent,
                            }
                        ),
                    }

                # ── Tool results ─────────────────────────────────────
                if kind == "on_tool_end":
                    tool_name = name
                    output = event["data"].get("output", "")
                    # ToolMessage has .content
                    if hasattr(output, "content"):
                        result_str = str(output.content)
                    else:
                        result_str = str(output)
                    # Truncate for the UI
                    if len(result_str) > 500:
                        result_str = result_str[:500] + "..."

                    yield {
                        "event": "tool_result",
                        "data": json.dumps(
                            {
                                "tool": tool_name,
                                "tool_label": _friendly_tool_name(
                                    tool_name
                                ),
                                "result": result_str,
                                "agent": current_agent,
                            }
                        ),
                    }

                # ── Token streaming ──────────────────────────────────
                if kind == "on_chat_model_stream":
                    chunk = event["data"].get("chunk")
                    if chunk and chunk.content:
                        yield {
                            "event": "token",
                            "data": json.dumps(
                                {"token": chunk.content}
                            ),
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
