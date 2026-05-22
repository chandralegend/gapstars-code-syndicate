# Phase 3 — LangGraph Orchestration + Agent 1 (Detailed Implementation Plan)

## Overview

Build the QA workflow state graph with Agent 1 (Feature Expectation Generator), two HITL interrupt points, and the Agent 2 placeholder node. Wire the graph into the existing runs router so `POST /test-scenarios/:id/runs` kicks off the workflow and `POST /runs/:id/feedback` resumes it from interrupts.

---

## Step 1 — Directory Structure

New files under `apps/api/src/api/`:

```
src/api/
├── qa_workflow/
│   ├── __init__.py
│   ├── state.py              # QAWorkflowState TypedDict
│   ├── graph.py              # build_qa_graph() — the StateGraph
│   ├── nodes/
│   │   ├── __init__.py
│   │   ├── load_context.py   # load_project_context node
│   │   ├── agent_1.py        # agent_1_generate node
│   │   ├── review_1.py       # human_review_1 node (interrupt)
│   │   ├── agent_2.py        # agent_2_placeholder node
│   │   ├── agent_3.py        # agent_3_generate node (Phase 4 — stub for now)
│   │   ├── review_3.py       # human_review_3 node (Phase 4 — stub for now)
│   │   └── persist.py        # persist_results node (Phase 4 — stub for now)
│   └── prompts/
│       ├── __init__.py
│       └── agent_1_prompt.py # System prompt + structured output schema
```

This is a **separate graph** from the existing chat agent graph in `api/agent/`. They share the same `PostgresSaver` checkpointer but are independent workflows.

---

## Step 2 — State Definition (`state.py`)

```python
class QAWorkflowState(TypedDict):
    # Inputs (set at graph start)
    run_id: str
    project_context: dict
    feature_description: str
    user_story: str
    acceptance_criteria: str

    # Agent 1 outputs
    feature_expectation: dict          # structured FeatureExpectation content
    feature_expectation_version: int

    # HITL 1
    human_decision_1: str              # "approve" | "revise" (set by Command(resume=...))
    human_feedback_1: str              # free-text (set by Command(resume=...))

    # Agent 2 outputs
    workspace_outputs: dict            # populated by Agent 2 (teammate's node)

    # Agent 3 outputs (Phase 4)
    test_cases: list[dict]
    test_cases_version: int

    # HITL 3 (Phase 4)
    human_decision_3: str
    human_feedback_3: str
```

Key design decisions:
- State fields for HITL decisions are populated by `Command(resume={"decision": ..., "feedback": ...})` when the graph resumes from an interrupt
- `run_id` correlates the graph execution to the DB `runs` row for status updates and persistence
- `project_context` is a dict snapshot of the project loaded at graph start (not a live DB reference)

---

## Step 3 — Graph Structure (`graph.py`)

```
START
  → load_project_context
  → agent_1_generate
  → human_review_1            ← interrupt()
  → route_after_review_1      ← conditional edge
      ├─ "revise" → agent_1_generate (loop back)
      └─ "approve" → agent_2_placeholder
  → agent_2_placeholder       ← blocks until Agent 2 completes
  → agent_3_generate          ← Phase 4 stub (passes through)
  → human_review_3            ← Phase 4 stub (passes through)
  → persist_results
  → END
```

### Edges

| From | To | Condition |
|------|----|-----------|
| `START` | `load_project_context` | always |
| `load_project_context` | `agent_1_generate` | always |
| `agent_1_generate` | `human_review_1` | always |
| `human_review_1` | `agent_1_generate` | `human_decision_1 == "revise"` |
| `human_review_1` | `agent_2_placeholder` | `human_decision_1 == "approve"` |
| `agent_2_placeholder` | `agent_3_generate` | always |
| `agent_3_generate` | `human_review_3` | always |
| `human_review_3` | `agent_3_generate` | `human_decision_3 == "revise"` |
| `human_review_3` | `persist_results` | `human_decision_3 == "approve"` |
| `persist_results` | `END` | always |

### `build_qa_graph(checkpointer, llm) -> CompiledGraph`

- Takes the shared `PostgresSaver` checkpointer and an LLM instance
- Returns a compiled `StateGraph[QAWorkflowState]`
- Stored in `app.state.qa_graph` at startup (alongside existing chat graphs)

---

## Step 4 — Node Implementations

### 4a. `load_context.py` — `load_project_context`

- Reads the `run_id` from state
- Opens a DB session, loads the `Run` → `TestScenario` → `Project`
- Returns state update:
  ```python
  {
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
  ```
- Updates run status to `agent1_running` via `run_service.update_status()`
- This node uses its own DB session (not FastAPI's `Depends`) since it runs inside the graph, not in a request handler

### 4b. `agent_1.py` — `agent_1_generate`

**LLM call with structured output.**

- Builds the prompt from `agent_1_prompt.py` (see Step 5)
- If `feature_expectation_version > 0` and `human_feedback_1` is set → this is a revision pass. The prompt includes the previous expectation + feedback
- Calls `llm.with_structured_output(FeatureExpectationOutput)` where `FeatureExpectationOutput` is a Pydantic model:
  ```python
  class FeatureExpectationOutput(BaseModel):
      feature_overview: str
      user_flows: list[UserFlow]
      data_contracts: str
      edge_cases: list[str]
      expanded_acceptance_criteria: list[str]
      dependencies_and_assumptions: list[str]
  ```
- Persists the output to `feature_expectations` table via `feature_expectation_service.create_next_version()`
- Returns state update:
  ```python
  {
      "feature_expectation": output.model_dump(),
      "feature_expectation_version": current_version + 1,
  }
  ```

### 4c. `review_1.py` — `human_review_1`

- Updates run status to `agent1_review`
- Calls `interrupt({"type": "review_feature_expectation", "version": state["feature_expectation_version"]})` — this pauses the graph
- When resumed via `Command(resume={"decision": "approve"|"revise", "feedback": "..."})`, the interrupt returns the resume value
- Returns state update:
  ```python
  {
      "human_decision_1": resume_value["decision"],
      "human_feedback_1": resume_value.get("feedback", ""),
  }
  ```
- If approved, updates the latest `feature_expectation` status to `approved` in DB
- If rejected, updates status to `rejected` with the feedback text

### 4d. `agent_2.py` — `agent_2_placeholder`

**This is the contract boundary for the teammate building Agent 2.**

- Updates run status to `agent2_running`
- Calls `interrupt({"type": "agent_2_handoff", "run_id": state["run_id"]})` — pauses the graph
- The teammate's system (external worker, separate service, etc.) does its work and then calls `POST /api/runs/:id/feedback` with `decision="approve"` and the workspace outputs in the feedback payload
- When resumed, the node reads the resume value and returns:
  ```python
  {
      "workspace_outputs": resume_value.get("workspace_outputs", {}),
  }
  ```

**Contract the teammate must follow:**
- Input: `run_id`, the approved `feature_expectation` content (readable via `GET /api/runs/:id/feature-expectation`)
- Output: resume the graph with `Command(resume={"workspace_outputs": {...}})` containing their analysis results
- They can use any approach internally (Claude sandbox, E2B, manual, etc.)

### 4e. Phase 4 stubs (`agent_3.py`, `review_3.py`, `persist.py`)

Simple pass-through nodes that return empty state updates. They exist so the graph compiles end-to-end and can be filled in during Phase 4.

```python
# agent_3.py
async def agent_3_generate(state: QAWorkflowState) -> dict:
    return {}

# review_3.py — will interrupt() in Phase 4, for now pass through
async def human_review_3(state: QAWorkflowState) -> dict:
    return {"human_decision_3": "approve"}

# persist.py
async def persist_results(state: QAWorkflowState) -> dict:
    # Update run status to completed
    ...
    return {}
```

---

## Step 5 — Agent 1 Prompt (`agent_1_prompt.py`)

### System Prompt Structure

```
You are a senior QA analyst. Your job is to produce a detailed feature
expectation document based on the project context and test scenario inputs.

## Project Context
Name: {name}
Description: {description}
Problem Statement: {problem_statement}
Target Users: {target_users}
Tech Stack: {tech_stack}
Additional Context: {additional_context}

## Your Task
Analyze the feature described below and produce a comprehensive expectation
document that covers every aspect a QA engineer would need to write thorough
test cases.

## Feature Inputs
Feature Description: {feature_description}
User Story: {user_story}
Acceptance Criteria: {acceptance_criteria}
```

### Revision Prompt (appended when `version > 1`)

```
## Previous Expectation (v{version})
{previous_expectation_json}

## Reviewer Feedback
{human_feedback}

Revise the expectation document based on the feedback above. Keep what was
correct, fix what was called out, and improve overall coverage.
```

### Output Schema

The LLM is called with `with_structured_output()` so the response is guaranteed to match the `FeatureExpectationOutput` Pydantic model. No parsing needed.

---

## Step 6 — Wire Graph into App Lifecycle (`main.py`)

Update the `lifespan` function:

```python
# After existing graph setup...
from api.qa_workflow.graph import build_qa_graph

qa_llm = create_llm()  # or a specific provider/model for QA
app.state.qa_graph = build_qa_graph(checkpointer=checkpointer, llm=qa_llm)
```

The QA graph shares the same `PostgresSaver` as the chat graph. Each run gets a unique `thread_id`, so there's no collision.

---

## Step 7 — Wire Graph into Runs Router

### `POST /api/test-scenarios/:id/runs` — Kick off the graph

Update `create_run` to:
1. Create the `Run` DB row (already done)
2. Invoke the graph asynchronously:
   ```python
   graph = request.app.state.qa_graph
   config = {"configurable": {"thread_id": run.thread_id}}
   initial_state = {"run_id": str(run.id)}
   # Fire-and-forget: graph runs until it hits the first interrupt
   asyncio.create_task(graph.ainvoke(initial_state, config=config))
   ```
3. Return `run_id` + `thread_id` immediately (the graph runs in background)

The graph will:
- `load_project_context` → reads DB, populates state
- `agent_1_generate` → calls LLM, persists feature expectation
- `human_review_1` → hits `interrupt()`, graph pauses
- Run status is now `agent1_review`

### `POST /api/runs/:id/feedback` — Resume from interrupt

Update `submit_feedback` to:
1. Look up the run's `thread_id`
2. Resume the graph:
   ```python
   graph = request.app.state.qa_graph
   config = {"configurable": {"thread_id": run.thread_id}}
   command = Command(resume={"decision": body.decision, "feedback": body.feedback})
   asyncio.create_task(graph.ainvoke(command, config=config))
   ```
3. Return updated run status

The graph resumes from the interrupt node, reads the decision, and either loops back to Agent 1 or proceeds to Agent 2.

---

## Step 8 — DB Session Inside Graph Nodes

Graph nodes run outside of FastAPI request handlers, so they can't use `Depends(get_session)`. Instead, each node that needs the DB creates its own session:

```python
from api.db.engine import async_session_maker

async def some_node(state: QAWorkflowState) -> dict:
    async with async_session_maker() as session:
        # ... do DB work ...
    return {... state updates ...}
```

This is safe because each node runs sequentially within a single graph execution. The session is scoped to the node's lifetime.

---

## Implementation Order

```
Step 1: Create directory structure
  ↓
Step 2: state.py (QAWorkflowState)
  ↓
Step 3: Node stubs (all nodes as pass-through)
  ↓
Step 4a: load_context.py (DB reads)
  ↓
Step 4b: agent_1.py + agent_1_prompt.py (LLM call + structured output)
  ↓
Step 4c: review_1.py (interrupt + resume handling)
  ↓
Step 4d: agent_2.py (interrupt placeholder)
  ↓
Step 5: graph.py (assemble StateGraph, compile)
  ↓
Step 6: Wire into main.py lifespan
  ↓
Step 7: Update runs router (kick off + resume)
  ↓
Step 8: End-to-end test
```

---

## Verification Checklist

- [ ] `POST /test-scenarios/:id/runs` creates a run and starts the graph
- [ ] Graph runs `load_project_context` → `agent_1_generate` → pauses at `human_review_1`
- [ ] Run status transitions: `pending` → `agent1_running` → `agent1_review`
- [ ] `GET /runs/:id/feature-expectation` returns the generated document
- [ ] `POST /runs/:id/feedback` with `{"decision":"revise","feedback":"add more edge cases"}` resumes the graph
- [ ] Agent 1 regenerates with feedback incorporated, graph pauses again at `human_review_1`
- [ ] `feature_expectations` table has v1 (rejected) and v2 (draft)
- [ ] `POST /runs/:id/feedback` with `{"decision":"approve"}` moves graph to `agent_2_placeholder`
- [ ] Run status transitions to `agent2_running`, graph pauses at Agent 2 interrupt
- [ ] `feature_expectations` latest version has `status=approved`
- [ ] Phase 4 stubs pass through cleanly (Agent 3 → review 3 → persist → END)
- [ ] Run status reaches `completed` after full pass-through
