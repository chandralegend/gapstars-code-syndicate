import uuid

from api.db.engine import async_session_maker
from api.db.models.run import RunStatus
from api.qa_workflow.state import QAWorkflowState
from api.services import agent_event_service, run_service


async def persist_results(state: QAWorkflowState) -> dict:
    run_id = uuid.UUID(state["run_id"])

    async with async_session_maker() as session:
        await run_service.update_status(
            session, run_id, RunStatus.COMPLETED.value, "persist_results"
        )

        await agent_event_service.create(
            session,
            run_id,
            node_name="persist_results",
            event_type="workflow_completed",
            payload={
                "feature_expectation_version": state.get(
                    "feature_expectation_version"
                ),
                "test_cases_version": state.get("test_cases_version"),
                "test_cases_count": len(state.get("test_cases", [])),
            },
        )

    return {}
