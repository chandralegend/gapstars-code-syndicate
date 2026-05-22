from api.qa_workflow.state import QAWorkflowState


async def human_review_3(state: QAWorkflowState) -> dict:
    return {"human_decision_3": "approve"}
