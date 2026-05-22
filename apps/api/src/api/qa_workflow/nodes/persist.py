import uuid

from api.db.engine import async_session_maker
from api.db.models.run import RunStatus
from api.qa_workflow.state import QAWorkflowState
from api.services import run_service


async def persist_results(state: QAWorkflowState) -> dict:
    run_id = uuid.UUID(state["run_id"])

    async with async_session_maker() as session:
        await run_service.update_status(
            session, run_id, RunStatus.COMPLETED.value, "persist_results"
        )

    return {}
