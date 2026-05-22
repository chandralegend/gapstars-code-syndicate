import json

from pydantic import BaseModel, Field


class UserFlow(BaseModel):
    name: str = Field(description="Name of the user flow")
    steps: list[str] = Field(description="Ordered steps the user takes")
    expected_outcome: str = Field(description="What should happen at the end")


class FeatureExpectationOutput(BaseModel):
    feature_overview: str = Field(
        description="High-level summary of what the feature does and why it exists"
    )
    user_flows: list[UserFlow] = Field(
        description="All user flows through this feature, including primary and alternate paths"
    )
    data_contracts: str = Field(
        description="Inputs, outputs, data formats, and API contracts relevant to this feature"
    )
    edge_cases: list[str] = Field(
        description="Edge cases, boundary conditions, and error scenarios to test"
    )
    expanded_acceptance_criteria: list[str] = Field(
        description="Acceptance criteria expanded from the user's input with additional detail"
    )
    dependencies_and_assumptions: list[str] = Field(
        description="External dependencies, assumptions, and constraints"
    )


SYSTEM_PROMPT = """\
You are a senior QA analyst. Your job is to produce a detailed feature \
expectation document based on the project context and test scenario inputs.

The document should cover every aspect a QA engineer would need to write \
thorough test cases — user flows, data contracts, edge cases, and expanded \
acceptance criteria.

Be specific and concrete. Reference the project's tech stack and target users \
where relevant. Do not be vague or generic."""


def build_initial_prompt(state: dict) -> str:
    ctx = state.get("project_context", {})
    return f"""\
## Project Context
- **Name:** {ctx.get("name", "N/A")}
- **Description:** {ctx.get("description", "N/A")}
- **Problem Statement:** {ctx.get("problem_statement", "N/A")}
- **Target Users:** {ctx.get("target_users", "N/A")}
- **Tech Stack:** {ctx.get("tech_stack", "N/A")}
- **Additional Context:** {ctx.get("additional_context", "N/A")}

## Feature Inputs
- **Feature Description:** {state.get("feature_description", "")}
- **User Story:** {state.get("user_story", "")}
- **Acceptance Criteria:** {state.get("acceptance_criteria", "")}

Produce the feature expectation document now."""


def build_revision_prompt(state: dict) -> str:
    ctx = state.get("project_context", {})
    prev = state.get("feature_expectation", {})
    feedback = state.get("human_feedback_1", "")
    version = state.get("feature_expectation_version", 1)

    return f"""\
## Project Context
- **Name:** {ctx.get("name", "N/A")}
- **Description:** {ctx.get("description", "N/A")}
- **Problem Statement:** {ctx.get("problem_statement", "N/A")}
- **Target Users:** {ctx.get("target_users", "N/A")}
- **Tech Stack:** {ctx.get("tech_stack", "N/A")}
- **Additional Context:** {ctx.get("additional_context", "N/A")}

## Feature Inputs
- **Feature Description:** {state.get("feature_description", "")}
- **User Story:** {state.get("user_story", "")}
- **Acceptance Criteria:** {state.get("acceptance_criteria", "")}

## Previous Expectation (v{version})
{json.dumps(prev, indent=2)}

## Reviewer Feedback
{feedback}

Revise the expectation document based on the feedback above. Keep what was \
correct, fix what was called out, and improve overall coverage."""
