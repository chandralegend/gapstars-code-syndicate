# QA/Test Case Generation Workflow — Implementation Plan

## Scope Boundaries

| Ours | Teammate A | Teammate B |
|------|-----------|-----------|
| Agent 1 (Feature Expectation) | Agent 2 (Workspace/Sandbox) | Frontend (Next.js) |
| Agent 3 (Test Case Generation) | | |
| Full LangGraph orchestration | | |
| DB models, migrations, API | | |
| HITL interrupt loops | | |
| SSE event streaming | | |

---

## Phase 1 — Database Foundation

**Goal:** Set up SQLAlchemy/SQLModel + Alembic and create the core data models.

**What to build:**

- Add `sqlalchemy`, `sqlmodel`, `alembic` dependencies to `pyproject.toml`
- Set up Alembic with async Postgres support
- Create models:
  - **`projects`** — `id`, `name`, `description`, `problem_statement`, `target_users`, `tech_stack`, `additional_context`, `created_at`, `updated_at`
  - **`test_scenarios`** — `id`, `project_id` (FK), `title`, `feature_description`, `user_story`, `acceptance_criteria`, `status` (enum: `draft` / `in_progress` / `completed`), `created_at`, `updated_at`
  - **`runs`** — `id`, `test_scenario_id` (FK), `thread_id` (LangGraph), `status` (enum: `pending` / `agent1_running` / `agent1_review` / `agent2_running` / `agent3_running` / `agent3_review` / `completed` / `failed`), `current_node`, `created_at`, `updated_at`
  - **`feature_expectations`** — `id`, `run_id` (FK), `version` (int), `content` (JSON/text — the detailed expectation doc), `status` (`draft` / `approved` / `rejected`), `feedback` (text), `created_at`
  - **`test_cases`** — `id`, `run_id` (FK), `version` (int), `category` (`happy` / `edge` / `corner`), `title`, `description`, `preconditions`, `steps` (JSON), `expected_result`, `status` (`draft` / `approved` / `rejected`), `feedback`, `created_at`
  - **`agent_events`** — `id`, `run_id` (FK), `node_name`, `event_type`, `payload` (JSON), `created_at` — append-only audit log
- Create CRUD service layer for each model
- Generate initial Alembic migration

**Deliverable:** `alembic upgrade head` creates all tables. CRUD operations work.

---

## Phase 2 — REST API Layer

**Goal:** Expose endpoints for projects, test scenarios, and runs that the frontend will consume.

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/projects` | Create project |
| `GET` | `/api/projects` | List projects |
| `GET` | `/api/projects/:id` | Get project with test scenarios |
| `PUT` | `/api/projects/:id` | Update project |
| `DELETE` | `/api/projects/:id` | Delete project |
| `POST` | `/api/projects/:id/test-scenarios` | Create test scenario |
| `GET` | `/api/projects/:id/test-scenarios` | List scenarios for project |
| `GET` | `/api/test-scenarios/:id` | Get scenario with runs |
| `POST` | `/api/test-scenarios/:id/runs` | Kick off the orchestration graph (returns `run_id`) |
| `GET` | `/api/runs/:id` | Get run status + current state |
| `GET` | `/api/runs/:id/events` | SSE stream of real-time agent events |
| `POST` | `/api/runs/:id/feedback` | Submit human feedback (resume from interrupt) |
| `GET` | `/api/runs/:id/feature-expectation` | Get latest feature expectation doc |
| `GET` | `/api/runs/:id/test-cases` | Get generated test cases |

**Deliverable:** All endpoints working with DB. SSE endpoint skeleton ready (events populated in Phase 3).

---

## Phase 3 — LangGraph Orchestration + Agent 1

**Goal:** Build the new state graph with Agent 1, HITL interrupt, Agent 2 placeholder, and the wiring.

### State Definition (`QAWorkflowState`)

```python
class QAWorkflowState(TypedDict):
    project_context: dict          # loaded from DB at graph start
    feature_description: str
    user_story: str
    acceptance_criteria: str
    feature_expectation: str       # Agent 1 output
    feature_expectation_version: int
    human_decision: str            # "approve" | "revise"
    human_feedback: str            # free-text feedback from user
    workspace_outputs: dict        # Agent 2 output (from teammate)
    test_cases: list[dict]         # Agent 3 output
    test_cases_version: int
    run_id: str                    # for DB correlation
```

### Graph Structure

```
START
  → load_project_context       (reads project from DB, injects into state)
  → agent_1_generate           (LLM call: generates feature expectation doc)
  → human_review_1             (interrupt() — pauses graph)
  → route_after_review_1       (conditional: approve → agent_2, revise → agent_1_generate)
  → agent_2_placeholder        (thin node: writes workspace job, waits for completion signal)
  → agent_3_generate           (LLM call: reads workspace outputs + spec, generates test cases)
  → human_review_3             (interrupt() — pauses graph)
  → route_after_review_3       (conditional: approve → persist_results, revise → agent_3_generate)
  → persist_results            (writes approved test cases to DB)
  → END
```

### Agent 1 — Feature Expectation Generator

- System prompt includes full project context (name, description, problem, tech stack, users)
- Input: feature description + user story + acceptance criteria
- Output: structured `FeatureExpectation` (Pydantic model) with sections:
  - Feature overview
  - User flows (step-by-step)
  - Data contracts / inputs & outputs
  - Edge cases & error scenarios
  - Acceptance criteria (expanded from user input)
  - Dependencies & assumptions
- On revision: receives previous version + human feedback, produces new version
- Each version persisted to `feature_expectations` table

### HITL Implementation

- Uses LangGraph's `interrupt()` — graph pauses, checkpoint saved
- `POST /api/runs/:id/feedback` resumes the graph via `Command(resume={"decision": "approve"|"revise", "feedback": "..."})`
- The `route_after_review_*` conditional edge reads `human_decision` and loops back or proceeds

### Agent 2 Integration Point (Contract for Teammate)

- A thin node that signals "Agent 2 should start" (writes a record to `workspace_jobs` table or publishes to Redis)
- Blocks until Agent 2's teammate marks the job complete (poll DB or Redis pubsub)
- Reads outputs from a known contract (e.g., `workspace_outputs` column in `runs`)
- This is the **handoff boundary** — we define the contract, teammate implements the internals

**Deliverable:** Full graph runs end-to-end. Agent 1 generates expectations, HITL loop 1 works, Agent 2 placeholder blocks/resumes.

---

## Phase 4 — Agent 3 + HITL Loop 2 + Persistence

**Goal:** Implement Agent 3, the second review loop, and final test case persistence.

### Agent 3 — Test Case Generator

- System prompt includes: project context + approved feature expectation + workspace outputs from Agent 2
- Output: list of `TestCase` objects (Pydantic) categorized as happy/edge/corner, each with:
  - Title
  - Category
  - Description
  - Preconditions
  - Test steps (ordered list)
  - Expected result
  - Rationale (why this case matters)
- On revision: receives previous test cases + human feedback, produces updated set
- Each version persisted to `test_cases` table

### Persist Results Node

- Marks all approved test cases with `status=approved` in DB
- Updates run status to `completed`
- Emits a final `agent_event` for the audit log

**Deliverable:** Complete workflow runs end-to-end: create project → create scenario → run → Agent 1 → review → Agent 2 → Agent 3 → review → persisted test cases.

---

## Phase 5 — SSE Streaming + Agent Events

**Goal:** Wire up real-time event streaming so the frontend can show live progress.

**What to build:**

- Every graph node emits structured events to `agent_events` table
- `GET /api/runs/:id/events` SSE endpoint streams these events in real-time
- Event types: `node_start`, `node_end`, `llm_token`, `interrupt`, `feedback_received`, `status_change`, `error`
- Use LangGraph's `astream_events` piped to SSE (same pattern as existing chat stream but adapted for the new graph)
- Include run status transitions in the stream

**Deliverable:** Frontend can subscribe to a run and see real-time progress through all phases, including when the graph is paused waiting for human input.

---

## Phase Dependency Diagram

```
Phase 1 (DB)
  ↓
Phase 2 (API)
  ↓
Phase 3 (Orchestration + Agent 1 + HITL 1 + Agent 2 contract)
  ↓
Phase 4 (Agent 3 + HITL 2 + Persistence)
  ↓
Phase 5 (SSE Streaming + Events)
```

- **Phases 1–2** can start immediately
- **Frontend teammate** can start building against the Phase 2 API stubs
- **Agent 2 teammate** needs the contract defined in Phase 3 (the state shape, the workspace job schema, and the expected output format)