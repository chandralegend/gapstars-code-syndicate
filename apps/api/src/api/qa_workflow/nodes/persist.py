import asyncio
import uuid

from api.db.engine import async_session_maker
from api.db.models.run import RunStatus
from api.qa_workflow.state import QAWorkflowState
from api.services import agent_event_service, run_service, test_case_service, test_script_bundle_service
from api.db.models.test_case import TestCaseStatus
import logging

logger = logging.getLogger(__name__)


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

    # Auto-trigger Agent 4 (script bundle generation) if there are
    # approved test cases. We import here to avoid circular imports
    # since the script_generation module imports from qa_workflow services.
    await _auto_trigger_script_generation(run_id)

    return {}


async def _auto_trigger_script_generation(run_id: uuid.UUID) -> None:
    """Create a bundle row and start Agent 4 in the background.

    Never raises — a failure here is logged and silently swallowed so
    the run stays 'completed' even if Agent 4 can't start.
    """
    try:
        from api.script_generation import run_script_generation

        async with async_session_maker() as session:
            cases = await test_case_service.list_by_run(session, run_id)
            if not cases:
                logger.info("persist_results: no test cases, skipping Agent 4 for run %s", run_id)
                return

            latest_version = max(c.version for c in cases)
            approved_count = sum(
                1 for c in cases
                if c.version == latest_version
                and c.status == TestCaseStatus.APPROVED.value
            )
            if approved_count == 0:
                logger.info("persist_results: no approved cases, skipping Agent 4 for run %s", run_id)
                return

            next_version = await test_script_bundle_service.get_next_version(session, run_id)
            bundle = await test_script_bundle_service.create(session, run_id, next_version)

        asyncio.create_task(run_script_generation(run_id, bundle.id))
        logger.info("persist_results: queued Agent 4 bundle %s for run %s", bundle.id, run_id)
    except Exception:
        logger.exception("persist_results: failed to auto-trigger Agent 4 for run %s", run_id)
