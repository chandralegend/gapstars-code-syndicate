import uuid

from langgraph.types import interrupt

from api.db.engine import async_session_maker
from api.db.models.feature_expectation import FeatureExpectationStatus
from api.db.models.run import RunStatus
from api.qa_workflow.state import QAWorkflowState
from api.services import feature_expectation_service, run_service


async def human_review_1(state: QAWorkflowState) -> dict:
    run_id = uuid.UUID(state["run_id"])
    version = state.get("feature_expectation_version", 1)

    async with async_session_maker() as session:
        await run_service.update_status(
            session, run_id, RunStatus.AGENT1_REVIEW.value, "human_review_1"
        )

    resume_value = interrupt(
        {"type": "review_feature_expectation", "version": version}
    )

    decision = resume_value["decision"]
    feedback = resume_value.get("feedback", "")

    async with async_session_maker() as session:
        latest = await feature_expectation_service.get_latest_by_run(session, run_id)
        if latest:
            if decision == "approve":
                await feature_expectation_service.update_status(
                    session, latest.id, FeatureExpectationStatus.APPROVED.value
                )
            else:
                await feature_expectation_service.update_status(
                    session,
                    latest.id,
                    FeatureExpectationStatus.REJECTED.value,
                    feedback=feedback,
                )

    return {
        "human_decision_1": decision,
        "human_feedback_1": feedback,
    }
