# QALoop

> Agentic QA pipeline. Describe a feature in plain English, watch four agents draft a brief, explore the live product, generate test cases, ship a runnable pytest bundle, then execute it and surface pass/fail in one place.

QALoop turns a one-line feature description into reproducible browser tests with a human-in-the-loop review at every stage.

## What it does

Each run walks one feature through five phases:

1. **Brief** — Agent 1 reads project context and writes a structured feature expectation: what it does, how users interact, edge cases, acceptance criteria. You review and approve before anything else runs.
2. **Sandbox exploration** — Agent 2 opens a real Chromium inside an isolated container, drives the product like a person would, and writes a markdown findings report plus screenshots.
3. **Test cases** — Agent 3 reads the brief and the findings, then proposes ≤24 test cases split across happy paths, edge cases, and corner cases. You review, edit, and approve.
4. **Test scripts** — Agent 4 generates a runnable pytest bundle from the approved cases (`run.sh` entrypoint, `tests/`, `manifest.json`, screenshot-on-failure conftest hook).
5. **Test execution** — The bundle is auto-executed in a fresh sandbox container. JUnit XML is parsed back into per-test rows with failure traces and screenshots. You can re-run any time.

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │            apps/web                  │
                    │     Next.js + shadcn + SSE           │
                    └────────────────┬─────────────────────┘
                                     │ HTTP + SSE
                                     ▼
              ┌──────────────────────────────────────────┐
              │              apps/api                     │
              │   FastAPI + LangGraph orchestrator        │
              │                                           │
              │   ┌──────────┐  ┌──────────┐ ┌──────────┐ │
              │   │ Agent 1  │  │ Agent 3  │ │ Agent 4  │ │
              │   │ (LLM)    │  │ (LLM)    │ │ (sandbox)│ │
              │   └──────────┘  └──────────┘ └──────────┘ │
              │   ┌──────────┐  ┌──────────────────────┐  │
              │   │ Agent 2  │  │ test-execution worker│  │
              │   │ (sandbox)│  │ (auto-triggered)     │  │
              │   └──────────┘  └──────────────────────┘  │
              └────────────────┬─────────────────────────┘
                       │ HTTP                │ HTTP
                       ▼                     ▼
        ┌──────────────────────┐  ┌─────────────────────┐
        │   Postgres            │  │ claude-sandbox-svc  │
        │   - runs, briefs      │  │ - spawns containers │
        │   - test cases        │  │ - kind=exploration  │
        │   - bundles           │  │ - kind=execution    │
        │   - executions        │  │ - live noVNC view   │
        └──────────────────────┘  └─────────────────────┘
                                            │
                                            ▼
                                  ┌────────────────────┐
                                  │ qa-sandbox:local    │
                                  │ Docker image        │
                                  │ - Chromium          │
                                  │ - pytest+playwright │
                                  │ - X11 + noVNC       │
                                  └────────────────────┘
```

### How the agents talk

LangGraph drives the workflow as a state machine with explicit human-review interrupts. Every state transition emits an `agent_event` row and an SSE message; the UI subscribes to the run's SSE stream and renders a live timeline.

```
START
 └─ load_project_context
     └─ agent_1_generate (Brief draft)
         └─ human_review_1     ◄── you approve / request changes
             └─ agent_2_placeholder (Sandbox exploration)
                 └─ agent_3_generate (Test case generation)
                     └─ human_review_3   ◄── you approve / request changes
                         └─ persist_results
                             ├─ marks run completed
                             └─ auto-triggers Agent 4 (script bundle)
                                 └─ on bundle success → auto-execution
END
```

Agent 4 and the test-execution worker live outside the main graph because they're side-channels: a single completed run can have many bundles, and a single bundle can be re-executed any number of times.

## Stack

| Layer | Tech |
|---|---|
| Orchestrator | LangGraph + FastAPI + Python 3.12 |
| LLMs | Anthropic Claude Sonnet 4.5 (Agents 1/3 LLM, Agents 2/4 driving Computer Use) |
| Frontend | Next.js 16 + shadcn/ui + Tailwind |
| Database | Postgres 16 (LangGraph checkpointer + app data) |
| Cache | Redis 7 |
| Sandbox runner | Anthropic Computer Use base image + pytest + playwright + chromium |
| Containers | Docker + Docker Compose |
| Package mgmt | uv (Python), bun (Node) |

## Quick start

### 1. Configure

```bash
cp .env.example .env
# Set ANTHROPIC_API_KEY in .env. The same key is used by Agents 1/3 (LLM)
# and forwarded to spawned sandbox containers used by Agents 2/4.
```

### 2. Build the runner image (one-time)

The `qa-sandbox:local` image is built outside compose because it embeds a
~500MB Chromium. Build it once:

```bash
docker build -t qa-sandbox:local apps/claude-sandbox-svc/docker
```

### 3. Bring up the stack

```bash
make up
# or: docker compose up --build -d
```

| Service | URL |
|---|---|
| Web UI | http://localhost:3000 |
| API | http://localhost:8001 |
| API docs | http://localhost:8001/docs |
| Sandbox service | http://localhost:8100 |
| Postgres | localhost:5432 |
| Redis | localhost:6380 |

### 4. Open the UI, create a project, start a run

```
1. Visit http://localhost:3000
2. Click "New project" — give it a name, description, and tech stack hint
3. Inside the project, click "New feature test" — a one-liner like
   "Converting EUR to LKR" is enough
4. Click the play button on the feature test row to start a run
5. Watch the timeline. Approve the brief when prompted, approve the
   test cases when prompted. The bundle generates and runs itself.
```

### 5. Local development (without Docker)

```bash
# Terminal 1: infra
make infra

# Terminal 2: API
make dev-api

# Terminal 3: Web
make dev-web
```

API runs on `:8001`, web on `:3001`, sharing the dockerized postgres + redis.

## Project structure

```
qaloop/
├── apps/
│   ├── api/                            # FastAPI + LangGraph orchestrator
│   │   ├── migrations/                 # alembic migrations (incl. test_executions)
│   │   └── src/api/
│   │       ├── qa_workflow/            # LangGraph state machine
│   │       │   ├── graph.py            # nodes + edges
│   │       │   ├── state.py
│   │       │   └── nodes/
│   │       │       ├── agent_1.py      # Brief drafting (LLM)
│   │       │       ├── agent_2.py      # Sandbox exploration (claude-sandbox-svc)
│   │       │       ├── agent_3.py      # Test case generation (LLM)
│   │       │       └── persist.py      # marks completed + auto-triggers Agent 4
│   │       ├── script_generation/      # Agent 4 (bundle generation)
│   │       │   ├── prompt.py           # bundle contract sent to Claude
│   │       │   └── worker.py           # runs the sandbox task and parses output
│   │       ├── test_execution/         # bundle execution worker
│   │       │   └── worker.py           # spawns kind=execution sandbox, parses JUnit
│   │       ├── sandbox/                # client for claude-sandbox-svc HTTP API
│   │       ├── routers/
│   │       │   ├── runs.py             # run lifecycle + SSE stream
│   │       │   ├── test_scripts.py     # bundle lifecycle
│   │       │   ├── test_executions.py  # execution lifecycle (incl. cancel)
│   │       │   └── ...
│   │       ├── services/               # one module per resource (CRUD + queries)
│   │       └── db/models/              # SQLModel models
│   │
│   ├── web/                            # Next.js frontend
│   │   ├── app/projects/[projectId]/
│   │   │   └── runs/[runId]/page.tsx   # run-detail (timeline + results)
│   │   ├── components/
│   │   │   ├── shell/                  # sidebar, topbar, command palette
│   │   │   └── probe/                  # shared probes (status badge, page-head)
│   │   └── lib/api/                    # typed client generated from OpenAPI
│   │
│   └── claude-sandbox-svc/             # Sandbox spawner service
│       ├── app/                        # FastAPI service
│       └── docker/                     # qa-sandbox:local image source
│           ├── Dockerfile
│           ├── entrypoint.sh           # dispatches on TASK_KIND
│           ├── headless.py             # exploration mode (Computer Use)
│           └── run_bundle.sh           # execution mode (run pytest)
│
├── docker-compose.yml
├── Makefile
└── .env.example
```

## Agent details

### Agent 1 — Brief

| | |
|---|---|
| Driver | Anthropic Claude (LLM-only, no sandbox) |
| Caps | ≤10 acceptance criteria, ≤8 edge cases |
| Output | Feature expectation row, version-bumped on each revision |
| Review gate | `agent1_review` — user approves or requests changes |

### Agent 2 — Sandbox exploration

| | |
|---|---|
| Driver | Claude Computer Use inside qa-sandbox container (kind=exploration) |
| Time budget | 6 minutes default, extendable from the UI |
| Output | `findings.md`, screenshots, full trace.jsonl |
| Soft success | If the sandbox times out but `findings.md` exists, treat as success |

### Agent 3 — Test cases

| | |
|---|---|
| Driver | Anthropic Claude (LLM-only) |
| Output | Up to 24 test cases per run, split across happy / edge / corner |
| Review gate | `agent3_review` — user approves the set |

### Agent 4 — Script bundle

| | |
|---|---|
| Driver | Claude Computer Use inside qa-sandbox container (kind=exploration) |
| Output | `tests/conftest.py` (with screenshot-on-failure hook), `run.sh`, `manifest.json`, ≤8 tests per file |
| Auto-trigger | Fires automatically when `persist_results` runs |
| Manual trigger | `POST /api/runs/:id/scripts` |

### Test execution (no LLM)

| | |
|---|---|
| Driver | qa-sandbox container in kind=execution mode |
| Source | Bundle workspace from Agent 4's task is copied into the new container's `input/bundle/` |
| Entrypoint | `bash /opt/runner/run_bundle.sh` runs `bash run.sh`, captures `reports/junit.xml`, `reports/summary.json`, `reports/screenshots/` |
| Persistence | `test_executions` row + per-test `test_execution_results` rows (full failure trace, screenshot path) |
| Auto-trigger | Fires when Agent 4 emits `script_bundle_succeeded` |
| Manual re-run | `POST /api/runs/:id/executions` |
| Cancel | `DELETE /api/executions/:id` |

## API surface

Documented at `/docs` (generated from FastAPI OpenAPI). Key endpoints:

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/projects` | Create a project |
| POST | `/api/projects/:id/test-scenarios` | Create a feature test |
| POST | `/api/test-scenarios/:id/runs` | Start a run |
| GET | `/api/runs/:id` | Run detail |
| GET | `/api/runs/:id/events` | SSE stream of timeline events |
| GET | `/api/runs/:id/feature-expectation` | The current brief |
| POST | `/api/runs/:id/feedback` | Approve or request changes at a review gate |
| GET | `/api/runs/:id/test-cases` | The test cases |
| GET | `/api/runs/:id/scripts/latest` | The current bundle |
| POST | `/api/runs/:id/scripts` | Manually trigger Agent 4 |
| GET | `/api/runs/:id/executions` | Execution history |
| POST | `/api/runs/:id/executions` | Trigger a manual execution |
| GET | `/api/executions/:id` | Execution detail with per-test rows |
| DELETE | `/api/executions/:id` | Cancel a queued or running execution |
| GET | `/api/executions/:id/artifacts/output/...` | Screenshots, JUnit XML, run-bundle log |

## Make targets

```bash
make help             # list every target
make install          # uv sync + bun install for all workspaces
make up               # docker compose up --build -d
make down             # docker compose down
make dev              # api + web in parallel without docker
make logs             # tail every container
make lint             # ruff + eslint
make typecheck        # tsc on the web workspace
make test             # pytest on the api workspace
```

## Environment variables

See `.env.example`. The minimum to run:

| Var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | LLM driver for Agents 1/3 and forwarded to sandbox containers |
| `LLM_PROVIDER` | `anthropic` (the default; `openai` and `mistral` are also wired) |
| `TOKEN_SECRET` | HMAC secret used by claude-sandbox-svc to sign noVNC URLs |
| `POSTGRES_*` | Database credentials |

Tuning knobs:

| Var | Default | What it changes |
|---|---|---|
| `SANDBOX_DEFAULT_TIMEOUT_SECONDS` | 360 | Agent 2 wall-clock budget (seconds) |
| `SANDBOX_MAX_ITERATIONS` | 12 | Agent 2 tool-call cap |
| `MAX_CONCURRENT_TASKS` | 2 | sandbox-svc concurrent containers |

## Sub-package docs

- [`apps/api/`](apps/api/) — FastAPI + LangGraph orchestrator
- [`apps/web/`](apps/web/README.md) — Next.js frontend
- [`apps/claude-sandbox-svc/`](apps/claude-sandbox-svc/README.md) — Sandbox spawner service

## License

MIT.
