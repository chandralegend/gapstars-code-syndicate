import json

from pydantic import BaseModel, Field


class TestStep(BaseModel):
    step_number: int = Field(description="Sequential step number")
    action: str = Field(description="What the tester does")
    expected: str = Field(description="What should happen after this step")


class TestCaseOutput(BaseModel):
    category: str = Field(description="One of: happy, edge, corner")
    title: str = Field(description="Short descriptive title for the test case")
    description: str = Field(
        description="What this test case verifies and why it matters"
    )
    preconditions: str = Field(
        description="Setup or state required before executing this test"
    )
    steps: list[TestStep] = Field(
        description="Ordered list of test steps with actions and expected results"
    )
    expected_result: str = Field(
        description="The overall expected outcome when all steps pass"
    )
    rationale: str = Field(
        description="Why this test case is important — what risk it mitigates"
    )


class TestCaseListOutput(BaseModel):
    test_cases: list[TestCaseOutput] = Field(
        description="Complete list of test cases covering happy paths, edge cases, and corner cases"
    )


SYSTEM_PROMPT = """\
You are a senior QA engineer specializing in test case design. Your job is to \
produce a comprehensive set of test cases from a feature expectation document, \
workspace analysis outputs, and project context.

## Guidelines

1. **Coverage categories:**
   - **Happy path** — the primary user flows working as intended
   - **Edge cases** — boundary conditions, unusual but valid inputs, permission \
boundaries, concurrency scenarios
   - **Corner cases** — rare combinations, unexpected states, failure recovery, \
data corruption guards

2. **Test case quality:**
   - Each test case must be independently executable
   - Steps must be concrete and unambiguous — a junior QA engineer should be \
able to follow them without asking questions
   - Expected results must be observable and verifiable
   - Preconditions must include all setup required (test data, user state, \
configuration)

3. **Coverage priorities:**
   - Cover every user flow from the feature expectation
   - Cover every edge case listed in the expectation
   - Cover error scenarios and graceful degradation
   - Consider the tech stack for implementation-specific test cases \
(e.g., API response codes, database constraints, UI states)

4. **Rationale:**
   - Every test case must explain what risk it mitigates — this helps \
the reviewer prioritize

Be thorough. Aim for 10–25 test cases depending on feature complexity. \
Do not pad with trivial cases; each one should catch a real potential defect."""


def build_initial_prompt(state: dict) -> str:
    ctx = state.get("project_context", {})
    fe = state.get("feature_expectation", {})
    ws = state.get("workspace_outputs", {})

    return f"""\
## Project Context
- **Name:** {ctx.get("name", "N/A")}
- **Description:** {ctx.get("description", "N/A")}
- **Problem Statement:** {ctx.get("problem_statement", "N/A")}
- **Target Users:** {ctx.get("target_users", "N/A")}
- **Tech Stack:** {ctx.get("tech_stack", "N/A")}
- **Additional Context:** {ctx.get("additional_context", "N/A")}

## Approved Feature Expectation
{json.dumps(fe, indent=2)}

## Workspace Analysis Outputs
{json.dumps(ws, indent=2)}

Generate the complete set of test cases now."""


def build_revision_prompt(state: dict) -> str:
    ctx = state.get("project_context", {})
    fe = state.get("feature_expectation", {})
    ws = state.get("workspace_outputs", {})
    prev_cases = state.get("test_cases", [])
    feedback = state.get("human_feedback_3", "")
    version = state.get("test_cases_version", 1)

    return f"""\
## Project Context
- **Name:** {ctx.get("name", "N/A")}
- **Description:** {ctx.get("description", "N/A")}
- **Problem Statement:** {ctx.get("problem_statement", "N/A")}
- **Target Users:** {ctx.get("target_users", "N/A")}
- **Tech Stack:** {ctx.get("tech_stack", "N/A")}
- **Additional Context:** {ctx.get("additional_context", "N/A")}

## Approved Feature Expectation
{json.dumps(fe, indent=2)}

## Workspace Analysis Outputs
{json.dumps(ws, indent=2)}

## Previous Test Cases (v{version})
{json.dumps(prev_cases, indent=2)}

## Reviewer Feedback
{feedback}

Revise the test cases based on the feedback above. Keep test cases that were \
correct, fix those that were called out, add any missing coverage, and remove \
any that were flagged as unnecessary or redundant."""
