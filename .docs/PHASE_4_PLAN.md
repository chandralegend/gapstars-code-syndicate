# Phase 4 — Agent 3 (Test Case Generator) + HITL Loop 2 + Persistence

## Overview

Replace the Phase 3 stubs for Agent 3, human review 3, and persist results with full implementations. After this phase, the complete end-to-end workflow runs: Agent 1 generates a feature expectation, the human reviews it, Agent 2 produces workspace outputs, Agent 3 generates categorized test cases from all prior context, the human reviews those test cases, and approved results are persisted to the database.

---

## Prerequisites

Phase 3 is complete. The following are already in place:

- **Graph wiring:** `agent_3_generate → human_review_3 → route_after_review_3` edges, including the conditional loop-back, exist in `graph.py`
- **State fields:** `test_cases`, `test_cases_version`, `human_decision_3`, `human_feedback_3` are defined in `QAWorkflowState`
- **DB model:** `TestCase` (with `category`, `version`, `steps` JSONB, `status`, `rationale`) in `db/models/test_case.py`
- **Service layer:** `test_case_service` with `bulk_create()`, `get_next_version()`, `list_by_run()`, `list_by_run_and_version()`, `bulk_update_status()`, `update_status()`
- **API endpoints:** `GET /api/runs/:id/test-cases` returns test cases, `POST /api/runs/:id/feedback` already accepts `agent3_review` status
- **Run statuses:** `AGENT3_RUNNING` and `AGENT3_REVIEW` enums already defined

**No new DB migrations, API endpoints, or graph edges are needed.** This phase is purely about filling in node logic.

---

## Files to Create

| File | Purpose |
|------|---------|
| `qa_workflow/prompts/agent_3_prompt.py` | System prompt, Pydantic output schema, prompt builder functions |

## Files to Modify

| File | Current State | Changes |
|------|---------------|---------|
| `qa_workflow/nodes/agent_3.py` | Empty stub (returns `{}`) | Full LLM call + DB persistence |
| `qa_workflow/nodes/review_3.py` | Auto-approves | Real `interrupt()` + status updates |
| `qa_workflow/nodes/persist.py` | Only updates run status | Also approves test cases + emits final event |
| `qa_workflow/graph.py` | Imports `agent_3_generate` as plain function | Import factory `make_agent_3_node`, pass `llm` |

---

## Step 1 — Agent 3 Output Schema (`prompts/agent_3_prompt.py`)

### Pydantic Models

```python
from pydantic import BaseModel, Field


class TestStep(BaseModel):
    step_number: int = Field(description="Sequential step number")
    action: str = Field(description="What the tester does")
    expected: str = Field(description="What should happen after this step")


class TestCaseOutput(BaseModel):
    category: str = Field(
        description="One of: happy, edge, corner"
    )
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
```

Using a wrapper `TestCaseListOutput` because `with_structured_output()` requires a single top-level object, not a bare list.

### System Prompt

```python
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
```

### Prompt Builder Functions

```python
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
```

---

## Step 2 — Agent 3 Node (`nodes/agent_3.py`)

Replace the stub with a factory function following the same pattern as Agent 1.

### Implementation

```python
import uuid

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage

from api.db.engine import async_session_maker
from api.db.models.run import RunStatus
from api.qa_workflow.prompts.agent_3_prompt import (
    SYSTEM_PROMPT,
    TestCaseListOutput,
    build_initial_prompt,
    build_revision_prompt,
)
from api.qa_workflow.state import QAWorkflowState
from api.services import run_service, test_case_service


def make_agent_3_node(llm: BaseChatModel):
    structured_llm = llm.with_structured_output(TestCaseListOutput)

    async def agent_3_generate(state: QAWorkflowState) -> dict:
        run_id = uuid.UUID(state["run_id"])
        current_version = state.get("test_cases_version", 0)
        is_revision = current_version > 0 and state.get("human_feedback_3")

        async with async_session_maker() as session:
            await run_service.update_status(
                session, run_id, RunStatus.AGENT3_RUNNING.value, "agent_3_generate"
            )

        if is_revision:
            user_prompt = build_revision_prompt(state)
        else:
            user_prompt = build_initial_prompt(state)

        messages = [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=user_prompt),
        ]
        result: TestCaseListOutput = await structured_llm.ainvoke(messages)

        # Convert Pydantic models to dicts for DB storage
        cases_dicts = []
        for tc in result.test_cases:
            cases_dicts.append({
                "category": tc.category,
                "title": tc.title,
                "description": tc.description,
                "preconditions": tc.preconditions,
                "steps": [s.model_dump() for s in tc.steps],
                "expected_result": tc.expected_result,
                "rationale": tc.rationale,
            })

        async with async_session_maker() as session:
            next_version = await test_case_service.get_next_version(
                session, run_id
            )
            await test_case_service.bulk_create(
                session, run_id, next_version, cases_dicts
            )

        return {
            "test_cases": cases_dicts,
            "test_cases_version": next_version,
        }

    return agent_3_generate
```

### Key design decisions

- **Factory pattern** (`make_agent_3_node(llm)`) — matches Agent 1. The LLM is bound once at graph build time, not per-invocation.
- **Structured output** — `with_structured_output(TestCaseListOutput)` guarantees valid JSON matching the schema. No parsing/retry needed.
- **Versioning** — `test_case_service.get_next_version()` auto-increments. On revision, a new batch of test cases is created at `version + 1`; the old version remains in the DB with `status=draft` or `status=rejected` for audit.
- **Steps as JSONB** — Each step is serialized via `model_dump()` to match the `steps: list[dict]` JSONB column on `TestCase`.

---

## Step 3 — Human Review 3 Node (`nodes/review_3.py`)

Replace the auto-approve stub with a real interrupt, mirroring `review_1.py`.

### Implementation

```python
import uuid

from langgraph.types import interrupt

from api.db.engine import async_session_maker
from api.db.models.run import RunStatus
from api.db.models.test_case import TestCaseStatus
from api.qa_workflow.state import QAWorkflowState
from api.services import run_service, test_case_service


async def human_review_3(state: QAWorkflowState) -> dict:
    run_id = uuid.UUID(state["run_id"])
    version = state.get("test_cases_version", 1)

    async with async_session_maker() as session:
        await run_service.update_status(
            session, run_id, RunStatus.AGENT3_REVIEW.value, "human_review_3"
        )

    resume_value = interrupt(
        {"type": "review_test_cases", "version": version}
    )

    decision = resume_value["decision"]
    feedback = resume_value.get("feedback", "")

    async with async_session_maker() as session:
        cases = await test_case_service.list_by_run_and_version(
            session, run_id, version
        )
        if decision == "approve":
            await test_case_service.bulk_update_status(
                session,
                [tc.id for tc in cases],
                TestCaseStatus.APPROVED,
            )
        else:
            for tc in cases:
                await test_case_service.update_status(
                    session,
                    tc.id,
                    TestCaseStatus.REJECTED,
                    feedback=feedback,
                )

    return {
        "human_decision_3": decision,
        "human_feedback_3": feedback,
    }
```

### Behavior

1. Updates run status to `agent3_review` — the frontend knows to show the test case review UI.
2. Calls `interrupt()` with metadata about which version is under review.
3. Graph pauses. The checkpoint is saved by `PostgresSaver`.
4. When the user submits feedback via `POST /api/runs/:id/feedback`, the graph resumes.
5. `resume_value` contains `{"decision": "approve"|"revise", "feedback": "..."}`.
6. On **approve**: all test cases at this version get `status=approved` in the DB.
7. On **revise**: all test cases at this version get `status=rejected` with the feedback text. The `route_after_review_3` conditional edge loops back to `agent_3_generate`, which will produce a new version incorporating the feedback.

---

## Step 4 — Update Persist Results Node (`nodes/persist.py`)

Enhance the persist node to do final bookkeeping beyond just setting the run status.

### Implementation

```python
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
```

### What changed

- Emits a `workflow_completed` event to `agent_events` with a summary payload (final versions and test case count). This gives the SSE stream a definitive "done" signal with useful metadata.

---

## Step 5 — Update Graph Builder (`graph.py`)

The graph currently imports `agent_3_generate` as a plain function. Switch it to the factory pattern.

### Changes

```python
# Before
from api.qa_workflow.nodes.agent_3 import agent_3_generate

# After
from api.qa_workflow.nodes.agent_3 import make_agent_3_node
```

In `build_qa_graph()`:

```python
# Before
graph.add_node("agent_3_generate", agent_3_generate)

# After
agent_3_node = make_agent_3_node(llm)
graph.add_node("agent_3_generate", agent_3_node)
```

No other graph changes needed — edges, conditionals, and routing are already wired from Phase 3.

---

## Step 6 — Agent Event Logging (Optional Enhancement)

Add event logging to Agent 3 and Review 3 nodes for observability. This is the same pattern used elsewhere and feeds the SSE endpoint.

### In `agent_3_generate` (inside the node function, after LLM call):

```python
async with async_session_maker() as session:
    await agent_event_service.create(
        session,
        run_id,
        node_name="agent_3_generate",
        event_type="node_end",
        payload={
            "version": next_version,
            "test_cases_count": len(cases_dicts),
            "categories": {
                "happy": sum(1 for c in cases_dicts if c["category"] == "happy"),
                "edge": sum(1 for c in cases_dicts if c["category"] == "edge"),
                "corner": sum(1 for c in cases_dicts if c["category"] == "corner"),
            },
        },
    )
```

### In `human_review_3` (after processing the decision):

```python
async with async_session_maker() as session:
    await agent_event_service.create(
        session,
        run_id,
        node_name="human_review_3",
        event_type="feedback_received",
        payload={
            "decision": decision,
            "version": version,
            "has_feedback": bool(feedback),
        },
    )
```

---

## Implementation Order

```
Step 1: Create prompts/agent_3_prompt.py
          (Pydantic models + system prompt + builder functions)
  ↓
Step 2: Replace nodes/agent_3.py
          (make_agent_3_node factory with LLM call + DB persistence)
  ↓
Step 3: Replace nodes/review_3.py
          (interrupt + status updates)
  ↓
Step 4: Update nodes/persist.py
          (add event logging)
  ↓
Step 5: Update graph.py
          (switch to make_agent_3_node factory)
  ↓
Step 6: Add agent event logging to Agent 3 + Review 3 nodes
  ↓
Step 7: End-to-end test
```

Steps 1–4 are independent of each other (no cross-file dependencies), but Step 5 depends on Step 2 being done first (the import changes). Step 6 is optional and can be done at any point.

---

## End-to-End Flow After Phase 4

```
1. POST /api/projects              → create project
2. POST /api/projects/:id/test-scenarios → create test scenario
3. POST /api/test-scenarios/:id/runs     → kicks off graph

   Graph runs:
   ├─ load_project_context         → reads project + scenario from DB
   ├─ agent_1_generate             → LLM generates feature expectation
   ├─ human_review_1               → interrupt() — graph pauses
   │   └─ POST /runs/:id/feedback  → {decision: "approve"}
   ├─ agent_2_placeholder          → interrupt() — waits for Agent 2
   │   └─ POST /runs/:id/feedback  → {decision: "approve", workspace_outputs: {...}}
   ├─ agent_3_generate             → LLM generates test cases      ← NEW
   ├─ human_review_3               → interrupt() — graph pauses    ← NEW
   │   └─ POST /runs/:id/feedback  → {decision: "revise", feedback: "add auth edge cases"}
   ├─ agent_3_generate             → LLM regenerates with feedback ← NEW (revision loop)
   ├─ human_review_3               → interrupt() — graph pauses    ← NEW
   │   └─ POST /runs/:id/feedback  → {decision: "approve"}
   ├─ persist_results              → marks run completed + event   ← UPDATED
   └─ END

4. GET /api/runs/:id/test-cases    → returns approved test cases
```

---

## Run Status Transitions

```
pending
  → agent1_running
  → agent1_review          (interrupt — waiting for human)
  → agent1_running          ← (if revised, loops back)
  → agent1_review           ← (interrupt again)
  → agent2_running          (interrupt — waiting for Agent 2 / teammate)
  → agent3_running          ← NEW
  → agent3_review           ← NEW (interrupt — waiting for human)
  → agent3_running          ← NEW (if revised, loops back)
  → agent3_review           ← NEW (interrupt again)
  → completed               (persist_results)
```

At any point, an unhandled exception transitions to `failed`.

---

## Verification Checklist

- [ ] `prompts/agent_3_prompt.py` exists with `TestCaseListOutput`, `TestStep`, `TestCaseOutput`, `SYSTEM_PROMPT`, `build_initial_prompt()`, `build_revision_prompt()`
- [ ] `make_agent_3_node(llm)` returns an async function that calls the LLM and returns state with `test_cases` + `test_cases_version`
- [ ] Agent 3 calls `run_service.update_status(AGENT3_RUNNING)` before the LLM call
- [ ] Agent 3 persists test cases via `test_case_service.bulk_create()` with correct version
- [ ] Agent 3 handles revision: when `test_cases_version > 0` and `human_feedback_3` is set, uses `build_revision_prompt()`
- [ ] `human_review_3` calls `interrupt()` with `{"type": "review_test_cases", "version": ...}`
- [ ] `human_review_3` updates run status to `agent3_review` before the interrupt
- [ ] On approve: all test cases at the current version get `status=approved`
- [ ] On revise: all test cases at the current version get `status=rejected` with feedback
- [ ] `route_after_review_3` loops back to `agent_3_generate` on "revise"
- [ ] `persist_results` emits a `workflow_completed` agent event
- [ ] `graph.py` uses `make_agent_3_node(llm)` instead of the plain function import
- [ ] Full end-to-end: create project → scenario → run → Agent 1 → approve → Agent 2 → Agent 3 → revise → Agent 3 v2 → approve → completed
- [ ] `GET /api/runs/:id/test-cases` returns the approved test cases with correct structure
- [ ] `test_cases` table has both v1 (rejected) and v2 (approved) rows after a revision cycle
- [ ] Agent events table contains `node_end` events for Agent 3 and `workflow_completed` from persist
