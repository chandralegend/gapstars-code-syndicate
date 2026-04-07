from __future__ import annotations

from typing import Literal

from langchain_core.messages import AIMessage, RemoveMessage, SystemMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode

from api.agent.agents.order_support import ORDER_SUPPORT_PROMPT
from api.agent.agents.technical_support import TECHNICAL_SUPPORT_PROMPT
from api.agent.agents.triage import TRIAGE_PROMPT
from api.agent.state import AgentState
from api.agent.tools.order_tools import ORDER_TOOLS
from api.agent.tools.technical_tools import TECHNICAL_TOOLS
from api.agent.tools.triage_tools import TRIAGE_TOOLS
from api.config import settings

# ── Routing tool (used by the Triage agent to delegate) ──────────────────────


@tool
def route_to_agent(agent_name: str) -> str:
    """Route the conversation to a specialist agent.

    Args:
        agent_name: The agent to route to. Must be one of:
            'order_support' or 'technical_support'.
    """
    if agent_name not in ("order_support", "technical_support"):
        return f"Invalid agent '{agent_name}'. Choose 'order_support' or 'technical_support'."
    return f"Routing to {agent_name}."


# ── Build the supervisor multi-agent graph ───────────────────────────────────


def build_graph(checkpointer: BaseCheckpointSaver | None = None):
    """Build and compile the supervisor-pattern multi-agent graph.

    Architecture:
        START -> triage (supervisor)
        triage -> triage_tools -> triage  (ReAct loop for FAQ etc.)
        triage -> handoff_to_order | handoff_to_tech  (delegation)
        handoff_* strips the route_to_agent tool call from messages
        order_support -> order_tools -> order_support  (ReAct loop)
        technical_support -> tech_tools -> technical_support  (ReAct loop)
        order_support | technical_support -> END

    Args:
        checkpointer: Optional checkpoint saver for persistent conversation state.

    Returns:
        A compiled LangGraph ``CompiledGraph`` instance.
    """
    llm = ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.openai_api_key,
        streaming=True,
    )

    # ── LLMs with tools bound ────────────────────────────────────────────

    triage_tools_list = TRIAGE_TOOLS + [route_to_agent]
    triage_llm = llm.bind_tools(triage_tools_list)

    order_llm = llm.bind_tools(ORDER_TOOLS)
    tech_llm = llm.bind_tools(TECHNICAL_TOOLS)

    # ── Tool nodes ───────────────────────────────────────────────────────

    triage_tool_node = ToolNode(TRIAGE_TOOLS + [route_to_agent])
    order_tool_node = ToolNode(ORDER_TOOLS)
    tech_tool_node = ToolNode(TECHNICAL_TOOLS)

    # ── Node functions ───────────────────────────────────────────────────

    async def triage_node(state: AgentState) -> AgentState:
        """Triage / supervisor agent: classify intent and route or respond."""
        messages = [SystemMessage(content=TRIAGE_PROMPT)] + state["messages"]
        response = await triage_llm.ainvoke(messages)
        return {"messages": [response], "current_agent": "triage"}

    def handoff_node(state: AgentState) -> AgentState:
        """Remove the triage AI message that contains the route_to_agent tool call.

        This prevents the specialist agent from seeing an orphaned tool_calls
        message without a corresponding tool response, which would cause an
        OpenAI API error.

        Any text content from triage's routing message (e.g. "Let me connect you
        with our order specialist...") is preserved as a plain AI message.
        """
        last: AIMessage = state["messages"][-1]
        text_content = last.content or ""

        # Remove the routing message (it has tool_calls the specialist can't see)
        updates: list = [RemoveMessage(id=last.id)]

        # If triage said something useful (e.g. acknowledgment), keep it as
        # a clean AI message without tool_calls
        if text_content.strip():
            updates.append(AIMessage(content=text_content))

        return {"messages": updates}

    async def order_support_node(state: AgentState) -> AgentState:
        """Order support specialist agent."""
        messages = [SystemMessage(content=ORDER_SUPPORT_PROMPT)] + state["messages"]
        response = await order_llm.ainvoke(messages)
        return {"messages": [response], "current_agent": "order_support"}

    async def technical_support_node(state: AgentState) -> AgentState:
        """Technical support specialist agent."""
        messages = [SystemMessage(content=TECHNICAL_SUPPORT_PROMPT)] + state["messages"]
        response = await tech_llm.ainvoke(messages)
        return {"messages": [response], "current_agent": "technical_support"}

    # ── Routing logic ────────────────────────────────────────────────────

    def triage_router(
        state: AgentState,
    ) -> Literal[
        "triage_tools",
        "handoff_to_order",
        "handoff_to_tech",
        "__end__",
    ]:
        """Decide where to go after the triage node.

        - If triage called route_to_agent -> handoff (clean up, then delegate)
        - If triage called other tools (e.g. lookup_faq) -> run triage_tools
        - If no tool calls -> end (triage handled it directly)
        """
        last: AIMessage = state["messages"][-1]
        if not hasattr(last, "tool_calls") or not last.tool_calls:
            return END

        # Check if any tool call is route_to_agent
        for tc in last.tool_calls:
            if tc["name"] == "route_to_agent":
                agent_name = tc["args"].get("agent_name", "")
                if agent_name == "order_support":
                    return "handoff_to_order"
                if agent_name == "technical_support":
                    return "handoff_to_tech"

        # Other tool calls (e.g. lookup_faq) go through triage's tool node
        return "triage_tools"

    def specialist_router(
        state: AgentState,
    ) -> Literal["order_tools", "tech_tools", "__end__"]:
        """Route specialist agents to their tools or end."""
        last: AIMessage = state["messages"][-1]
        if not hasattr(last, "tool_calls") or not last.tool_calls:
            return END

        agent = state.get("current_agent", "")
        if agent == "order_support":
            return "order_tools"
        if agent == "technical_support":
            return "tech_tools"
        return END

    # ── Graph assembly ───────────────────────────────────────────────────

    graph = StateGraph(AgentState)

    # Add nodes
    graph.add_node("triage", triage_node)
    graph.add_node("triage_tools", triage_tool_node)
    graph.add_node("handoff_to_order", handoff_node)
    graph.add_node("handoff_to_tech", handoff_node)
    graph.add_node("order_support", order_support_node)
    graph.add_node("order_tools", order_tool_node)
    graph.add_node("technical_support", technical_support_node)
    graph.add_node("tech_tools", tech_tool_node)

    # Entry point
    graph.add_edge(START, "triage")

    # Triage routing
    graph.add_conditional_edges(
        "triage",
        triage_router,
        ["triage_tools", "handoff_to_order", "handoff_to_tech", END],
    )

    # Triage tool results come back to triage
    graph.add_edge("triage_tools", "triage")

    # Handoff nodes lead to their respective specialist
    graph.add_edge("handoff_to_order", "order_support")
    graph.add_edge("handoff_to_tech", "technical_support")

    # Specialist routing (tool loops)
    graph.add_conditional_edges(
        "order_support",
        specialist_router,
        ["order_tools", END],
    )
    graph.add_conditional_edges(
        "technical_support",
        specialist_router,
        ["tech_tools", END],
    )

    # Tool results return to their respective specialist
    graph.add_edge("order_tools", "order_support")
    graph.add_edge("tech_tools", "technical_support")

    # ── Compile ──────────────────────────────────────────────────────────

    compile_kwargs: dict = {}
    if checkpointer is not None:
        compile_kwargs["checkpointer"] = checkpointer

    return graph.compile(**compile_kwargs)
