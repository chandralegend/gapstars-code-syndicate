import uuid

from langgraph.types import interrupt

from api.db.engine import async_session_maker
from api.db.models.run import RunStatus
from api.qa_workflow.state import QAWorkflowState
from api.services import run_service


async def agent_2_placeholder(state: QAWorkflowState) -> dict:
    run_id = uuid.UUID(state["run_id"])

    async with async_session_maker() as session:
        await run_service.update_status(
            session, run_id, RunStatus.AGENT2_RUNNING.value, "agent_2_placeholder"
        )

    resume_value = interrupt(
        {"type": "agent_2_handoff", "run_id": state["run_id"]}
    )

    return {
        "workspace_outputs": resume_value.get("workspace_outputs", {}),
    }
