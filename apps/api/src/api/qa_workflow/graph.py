from langchain_core.language_models.chat_models import BaseChatModel
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph

from api.qa_workflow.nodes.agent_1 import make_agent_1_node
from api.qa_workflow.nodes.agent_2 import agent_2_placeholder
from api.qa_workflow.nodes.agent_3 import agent_3_generate
from api.qa_workflow.nodes.load_context import load_project_context
from api.qa_workflow.nodes.persist import persist_results
from api.qa_workflow.nodes.review_1 import human_review_1
from api.qa_workflow.nodes.review_3 import human_review_3
from api.qa_workflow.state import QAWorkflowState


def route_after_review_1(state: QAWorkflowState) -> str:
    if state.get("human_decision_1") == "revise":
        return "agent_1_generate"
    return "agent_2_placeholder"


def route_after_review_3(state: QAWorkflowState) -> str:
    if state.get("human_decision_3") == "revise":
        return "agent_3_generate"
    return "persist_results"


def build_qa_graph(
    checkpointer: BaseCheckpointSaver | None = None,
    llm: BaseChatModel | None = None,
):
    if llm is None:
        from api.agent.llm_factory import create_llm

        llm = create_llm()

    agent_1_node = make_agent_1_node(llm)

    graph = StateGraph(QAWorkflowState)

    graph.add_node("load_project_context", load_project_context)
    graph.add_node("agent_1_generate", agent_1_node)
    graph.add_node("human_review_1", human_review_1)
    graph.add_node("agent_2_placeholder", agent_2_placeholder)
    graph.add_node("agent_3_generate", agent_3_generate)
    graph.add_node("human_review_3", human_review_3)
    graph.add_node("persist_results", persist_results)

    graph.add_edge(START, "load_project_context")
    graph.add_edge("load_project_context", "agent_1_generate")
    graph.add_edge("agent_1_generate", "human_review_1")

    graph.add_conditional_edges(
        "human_review_1",
        route_after_review_1,
        ["agent_1_generate", "agent_2_placeholder"],
    )

    graph.add_edge("agent_2_placeholder", "agent_3_generate")
    graph.add_edge("agent_3_generate", "human_review_3")

    graph.add_conditional_edges(
        "human_review_3",
        route_after_review_3,
        ["agent_3_generate", "persist_results"],
    )

    graph.add_edge("persist_results", END)

    compile_kwargs: dict = {}
    if checkpointer is not None:
        compile_kwargs["checkpointer"] = checkpointer

    return graph.compile(**compile_kwargs)
