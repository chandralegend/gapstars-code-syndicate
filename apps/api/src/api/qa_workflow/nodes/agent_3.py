import uuid

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage

from api.db.engine import async_session_maker
from api.db.models.run import RunStatus
from api.qa_workflow.prompts.agent_3_prompt import (
    SYSTEM_PROMPT,
    TestCaseListOutput,
    build_initial_prompt,
    build_revision_prompt,
)
from api.qa_workflow.state import QAWorkflowState
from api.services import agent_event_service, run_service, test_case_service


def make_agent_3_node(llm: BaseChatModel):
    structured_llm = llm.with_structured_output(TestCaseListOutput)

    async def agent_3_generate(state: QAWorkflowState) -> dict:
        run_id = uuid.UUID(state["run_id"])
        current_version = state.get("test_cases_version", 0)
        is_revision = current_version > 0 and state.get("human_feedback_3")

        async with async_session_maker() as session:
            await run_service.update_status(
                session, run_id, RunStatus.AGENT3_RUNNING.value, "agent_3_generate"
            )

        if is_revision:
            user_prompt = build_revision_prompt(state)
        else:
            user_prompt = build_initial_prompt(state)

        messages = [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=user_prompt),
        ]
        result: TestCaseListOutput = await structured_llm.ainvoke(messages)

        cases_dicts = []
        for tc in result.test_cases:
            cases_dicts.append(
                {
                    "category": tc.category,
                    "title": tc.title,
                    "description": tc.description,
                    "preconditions": tc.preconditions,
                    "steps": [s.model_dump() for s in tc.steps],
                    "expected_result": tc.expected_result,
                    "rationale": tc.rationale,
                }
            )

        async with async_session_maker() as session:
            next_version = await test_case_service.get_next_version(session, run_id)
            await test_case_service.bulk_create(session, run_id, next_version, cases_dicts)

            await agent_event_service.create(
                session,
                run_id,
                node_name="agent_3_generate",
                event_type="node_end",
                payload={
                    "version": next_version,
                    "test_cases_count": len(cases_dicts),
                    "categories": {
                        "happy": sum(
                            1 for c in cases_dicts if c["category"] == "happy"
                        ),
                        "edge": sum(
                            1 for c in cases_dicts if c["category"] == "edge"
                        ),
                        "corner": sum(
                            1 for c in cases_dicts if c["category"] == "corner"
                        ),
                    },
                },
            )

        return {
            "test_cases": cases_dicts,
            "test_cases_version": next_version,
        }

    return agent_3_generate
