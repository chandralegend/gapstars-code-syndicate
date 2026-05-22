import uuid

from langgraph.types import interrupt

from api.db.engine import async_session_maker
from api.db.models.run import RunStatus
from api.db.models.test_case import TestCaseStatus
from api.qa_workflow.state import QAWorkflowState
from api.services import agent_event_service, run_service, test_case_service


async def human_review_3(state: QAWorkflowState) -> dict:
    run_id = uuid.UUID(state["run_id"])
    version = state.get("test_cases_version", 1)

    async with async_session_maker() as session:
        await run_service.update_status(
            session, run_id, RunStatus.AGENT3_REVIEW.value, "human_review_3"
        )
        await agent_event_service.create(
            session,
            run_id,
            node_name="human_review_3",
            event_type="interrupt",
            payload={"type": "review_test_cases", "version": version},
        )

    resume_value = interrupt({"type": "review_test_cases", "version": version})

    decision = resume_value["decision"]
    feedback = resume_value.get("feedback", "")

    async with async_session_maker() as session:
        cases = await test_case_service.list_by_run_and_version(
            session, run_id, version
        )
        if decision == "approve":
            await test_case_service.bulk_update_status(
                session,
                [tc.id for tc in cases],
                TestCaseStatus.APPROVED,
            )
        else:
            for tc in cases:
                await test_case_service.update_status(
                    session,
                    tc.id,
                    TestCaseStatus.REJECTED,
                    feedback=feedback,
                )

        await agent_event_service.create(
            session,
            run_id,
            node_name="human_review_3",
            event_type="feedback_received",
            payload={
                "decision": decision,
                "version": version,
                "has_feedback": bool(feedback),
            },
        )

    return {
        "human_decision_3": decision,
        "human_feedback_3": feedback,
    }
