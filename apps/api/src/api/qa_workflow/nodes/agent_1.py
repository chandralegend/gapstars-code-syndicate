import uuid

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage

from api.db.engine import async_session_maker
from api.db.models.run import RunStatus
from api.qa_workflow.prompts.agent_1_prompt import (
    SYSTEM_PROMPT,
    FeatureExpectationOutput,
    build_initial_prompt,
    build_revision_prompt,
)
from api.qa_workflow.state import QAWorkflowState
from api.services import feature_expectation_service, run_service


def make_agent_1_node(llm: BaseChatModel):
    structured_llm = llm.with_structured_output(FeatureExpectationOutput)

    async def agent_1_generate(state: QAWorkflowState) -> dict:
        run_id = uuid.UUID(state["run_id"])
        current_version = state.get("feature_expectation_version", 0)
        is_revision = current_version > 0 and state.get("human_feedback_1")

        async with async_session_maker() as session:
            await run_service.update_status(
                session, run_id, RunStatus.AGENT1_RUNNING.value, "agent_1_generate"
            )

        if is_revision:
            user_prompt = build_revision_prompt(state)
        else:
            user_prompt = build_initial_prompt(state)

        messages = [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=user_prompt),
        ]
        result: FeatureExpectationOutput = await structured_llm.ainvoke(messages)
        content = result.model_dump()

        async with async_session_maker() as session:
            if current_version == 0:
                fe = await feature_expectation_service.create(session, run_id, content)
            else:
                fe = await feature_expectation_service.create_next_version(
                    session, run_id, content
                )

        return {
            "feature_expectation": content,
            "feature_expectation_version": fe.version,
        }

    return agent_1_generate
