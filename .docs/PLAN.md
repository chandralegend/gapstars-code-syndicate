Let me sketch the agent graph first so the phase breakdown lines up with it.A few notes on the graph itself before the phases:

The whole thing is one LangGraph state graph with a single shared `State` TypedDict (project_id, test_id, feature_spec, workspace_outputs, test_cases, human_decision, logs, etc.). The two "Human review" nodes are `interrupt()` calls — LangGraph pauses the graph mid-run, the frontend renders whatever is in state, the user accepts or edits, and the graph resumes from the same checkpoint. This is important because it means you don't have to invent your own state machine for the HITL loops — `PostgresSaver` handles persistence and resume natively. Agent 2 doesn't *do* the feature understanding itself; it provisions a workspace and waits for a completion signal (poll or pubsub). Script generation is a separate sub-graph triggered explicitly by the user, not part of the main run.

## Phase 1 — Agents (LangGraph backend)

This is the orchestration core. Stack: Python 3.11, FastAPI, LangGraph with `PostgresSaver` for checkpointing, LangChain for LLM calls (Anthropic), SQLAlchemy/SQLModel + Alembic on Postgres, Redis for pub/sub and as a Celery/ARQ broker for long-running jobs, Langfuse or LangSmith for trace observability.

The three agents are LangGraph nodes that each call Claude with structured output (Pydantic schemas):

Agent 1 takes the project context and test inputs and returns a `FeatureExpectation` object — sections for what the feature does, user flows, data contracts, acceptance criteria. Versioned in DB so feedback loops produce a clean diff.

Agent 2 is mostly an orchestrator node — it writes a workspace job to a queue (the actual Claude+sandbox runs as a separate worker, see Phase 2), then the graph blocks on a "workspace done" event before continuing. Keep the LangGraph node itself thin; the heavy lifting is in the worker.

Agent 3 reads the workspace outputs (markdown/JSON dropped by the Claude agent) plus the original feature spec, and returns a list of `TestCase` objects categorized as happy/edge/corner with rationale.

For the FastAPI surface you need roughly: `POST /projects`, `POST /projects/:id/tests`, `POST /tests/:id/runs` (kicks off the graph), `GET /runs/:id/events` (SSE stream of LangGraph events), `POST /runs/:id/feedback` (resumes from interrupt), and later `POST /test-cases/:id/generate-script`.

Data model — keep it boring and explicit: `projects`, `tests`, `runs` (with `checkpoint_id`, `status`, `current_node`), `feature_expectations` (versioned per run), `workspace_jobs`, `test_cases`, `scripts`, `script_executions`, `agent_events` (structured log of every node entry/exit, with payload). The `agent_events` table is what powers the live timeline in the frontend and your audit trail — make it append-only.

Streaming: use LangGraph's `astream_events` and pipe to SSE. Each event becomes a row in `agent_events` and a frame on the wire. Don't use WebSockets unless you actually need bidirectional — SSE is simpler and plays better with Next.js route handlers.

## Phase 2 — Claude Workspace + Sandbox Setup

This is the riskiest piece, so worth choosing the substrate deliberately. You have three realistic paths:

**Option A — Anthropic's Claude Agent SDK + E2B sandboxes.** E2B is purpose-built for "give an LLM a Linux box". You get an SDK that spins a Firecracker microVM in ~150ms with filesystem, processes, code execution, and a hosted browser. Cleanest developer experience, you don't manage Docker. Best fit if Agent 2's job is mostly "explore the feature with Python and a browser, write findings to files".

**Option B — Anthropic's Computer Use reference Docker.** Anthropic publishes a reference Docker image that runs a Linux desktop with a browser, and Claude drives it via the Computer Use tool. Heavier (full desktop, VNC), but you get pixel-level browser control if the QA target is a visual UI. You'd also need a noVNC stream to optionally show the user what the agent is doing live — which is a killer demo feature for a QA product.

**Option C — Roll your own with Docker SDK.** Most control, most ops burden. Skip unless the others can't do what you need.

My recommendation: start with **E2B for Phase 2** (cheaper, faster iteration), and add the Computer-Use-Docker path later as a "visual QA" mode if the product needs to actually click through real UIs. That second mode is also what you'd want for Phase 2's script generation step, since Playwright scripts are the natural output of pixel-level exploration.

Regardless of substrate, define a workspace contract every Claude agent must follow: a fixed output directory (`/workspace/outputs/`) with `findings.md`, `artifacts/`, `events.jsonl`. The orchestrator only reads from these paths. This is what your "set of rules" becomes — a system prompt template plus a directory convention. Cache key for scripts = hash of (feature_spec_version, test_case_id, workspace_image_version) so re-runs are deterministic.

Workers should be Celery or ARQ, not FastAPI background tasks — these jobs run for minutes and you need retry, timeouts, and visibility.

## Phase 3 — Frontend (Next.js)

App Router, TailwindCSS, shadcn/ui, TanStack Query for fetching, Zustand for run-local state, native EventSource for the SSE stream, Monaco for the script viewer. Optionally React Flow for a visual rendering of the agent graph state.

The screens that matter:

**Project onboarding** — multi-step wizard, not a single huge form. Steps for context, personas (repeatable rows), links/credentials, and rules/constraints. Save draft on every step so the user can come back.

**Test creation** — looks like a PM brief. Title, what's being tested, what's explicitly out of scope, success criteria, references. A rich text area (Tiptap) is enough; don't overthink it.

**Run view — the main attraction.** A vertical timeline of the orchestration graph on the left (each node a card that fills in as events stream), a context panel on the right that swaps based on which node is active. When the graph hits an `interrupt()`, the right panel becomes the review UI for that step. For Agent 2, the right panel shows live workspace activity — file tree, latest `findings.md`, optionally an embedded noVNC viewer if you went with Computer Use. Log tail at the bottom.

**Feature expectation review** — markdown rendered with inline edit + a comment-style "send feedback" textarea. Submitting feedback resumes the graph with the comment in state.

**Test case review** — table grouped by category (happy / edge / corner), expandable rows for the full description, accept/reject/edit per row, bulk accept. This is the final HITL gate.

**Scripts page** — list of generated scripts per test, each with a run button. Clicking run spawns the worker, streams logs in a drawer, persists results. Since scripts are cached and runnable without an LLM, this should feel instant relative to the generation phase.

**Run history** — list of past runs per test with status, duration, and the ability to drill in.

For real-time, every page that watches a run subscribes to the same `/runs/:id/events` SSE endpoint. Don't duplicate streams per panel — fan out client-side.

## A couple of cross-cutting things worth deciding early

Versioning: feature expectations and test cases should be versioned per run, not overwritten on feedback. Diff views become trivial and your audit story is clean.

Cost guard rails: each run can spawn multiple Claude workspaces, and script generation fans out further. Add a per-run budget cap and show estimated cost in the UI before kickoff. Especially important if you go with the Computer Use path.

Observability: Langfuse plugged into LangChain captures every LLM call with cost/latency. Pair that with your `agent_events` table and you've got a debug story for both the LLM side and the orchestration side from day one — don't bolt this on later.

If you want, I can sketch the LangGraph `StateGraph` skeleton in code next — the TypedDict, the node functions, the conditional edges for the HITL loops, and a `PostgresSaver` wiring example. That's usually the fastest way to validate the design before you commit to the surrounding infra.