import uuid

from api.db.engine import async_session_maker
from api.db.models.run import RunStatus
from api.qa_workflow.state import QAWorkflowState
from api.services import (
    agent_event_service,
    project_service,
    run_service,
    test_scenario_service,
)


async def load_project_context(state: QAWorkflowState) -> dict:
    run_id = uuid.UUID(state["run_id"])

    async with async_session_maker() as session:
        await agent_event_service.create(
            session,
            run_id,
            node_name="load_project_context",
            event_type="node_start",
            payload=None,
        )

        run = await run_service.get_by_id(session, run_id)
        scenario = await test_scenario_service.get_by_id(session, run.test_scenario_id)
        project = await project_service.get_by_id(session, scenario.project_id)

        await run_service.update_status(
            session, run_id, RunStatus.AGENT1_RUNNING.value, "load_project_context"
        )

        await agent_event_service.create(
            session,
            run_id,
            node_name="load_project_context",
            event_type="node_end",
            payload={"project_id": str(project.id), "scenario_id": str(scenario.id)},
        )

    return {
        "project_context": {
            "name": project.name,
            "description": project.description,
            "problem_statement": project.problem_statement,
            "target_users": project.target_users,
            "tech_stack": project.tech_stack,
            "additional_context": project.additional_context,
        },
        "feature_description": scenario.feature_description,
        "user_story": scenario.user_story,
        "acceptance_criteria": scenario.acceptance_criteria,
    }
