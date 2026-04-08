from __future__ import annotations

from typing import Annotated

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict


class AgentState(TypedDict):
    """State shared across all nodes in the agent graph."""

    messages: Annotated[list[BaseMessage], add_messages]
    """Conversation message history, automatically merged by LangGraph."""

    current_agent: str
    """Name of the agent currently handling the conversation.

    One of: 'triage', 'order_support', 'technical_support'.
    Used by the frontend to display agent badges.
    """
