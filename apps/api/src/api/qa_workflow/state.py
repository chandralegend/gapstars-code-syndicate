from typing import TypedDict


class QAWorkflowState(TypedDict, total=False):
    # Inputs (set at graph start)
    run_id: str
    project_context: dict
    feature_description: str
    user_story: str
    acceptance_criteria: str

    # Agent 1 outputs
    feature_expectation: dict
    feature_expectation_version: int

    # HITL 1
    human_decision_1: str
    human_feedback_1: str

    # Agent 2 outputs
    workspace_outputs: dict

    # Agent 3 outputs (Phase 4)
    test_cases: list[dict]
    test_cases_version: int

    # HITL 3 (Phase 4)
    human_decision_3: str
    human_feedback_3: str
