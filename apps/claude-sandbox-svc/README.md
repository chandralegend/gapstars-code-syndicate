# claude-sandbox-svc

Local FastAPI service that spins up isolated Docker sandboxes on demand. Each task runs in its own ephemeral container in one of two modes — **exploration** (Claude Computer Use driving a real browser) or **execution** (running a pre-built test bundle and capturing its reports). The exploration mode exposes a live noVNC view through a signed-URL reverse proxy.

## Architecture

```
client ──HTTP──► FastAPI service ──docker.sock──► sandbox container
                  │                                ├─ Xvfb + noVNC + Firefox + Chromium
                  │                                ├─ kind=exploration:
                  │                                │    headless agent runner
                  │                                │    (computer_use_demo.loop.sampling_loop)
                  │                                └─ kind=execution:
                  │                                     run_bundle.sh -> bash bundle/run.sh
                  │
                  ├─ SQLite (task metadata)
                  ├─ data/tasks/{id}/  (input, output, screenshots, logs)
                  └─ /tasks/{id}/vnc/* (signed-URL reverse proxy to noVNC)
```

- One container per task. Container starts in `STARTING`, transitions to `RUNNING` once Docker reports it up, and ends in one of `SUCCEEDED`, `FAILED`, `TIMEOUT`, `CANCELLED`.
- Tasks come in two kinds:
  - **`exploration`** (default) — Anthropic's `computer_use_demo.loop.sampling_loop` drives Chrome inside the container. Used by QALoop's Agents 2 and 4 for browsing and bundle generation.
  - **`execution`** — the source task's `output/workspace/` is copied to the new container's `/task/input/bundle/`, then `bash run.sh` executes there. Used by QALoop's test-execution worker.
- The runner reads `/task/input.json` (exploration) or `/task/input/bundle/run.sh` (execution) and writes `/task/output/...`.
- Concurrency is bounded by `MAX_CONCURRENT_TASKS`; overflow stays `QUEUED` in SQLite.
- Live view goes through the API service: `/tasks/{id}/viewer?token=…` (HMAC-bound to the task id), which iframes `/tasks/{id}/vnc/vnc.html?token=…` and `/tasks/{id}/vnc/websockify`.

See [`PLAN.md`](./PLAN.md) for the original design doc.

## Prerequisites

- Docker (daemon running)
- Python 3.11+
- An Anthropic API key (only needed for exploration tasks)

## Setup

```bash
# 1. Build the sandbox image (extends Anthropic's reference)
./scripts/build_image.sh

# 2. Install the API service
python3 -m venv .venv && source .venv/bin/activate
pip install -e '.[dev]'

# 3. Configure
export ANTHROPIC_API_KEY=sk-ant-...
export TOKEN_SECRET="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
# Optional:
# export MAX_CONCURRENT_TASKS=2
# export DEFAULT_MODEL=claude-sonnet-4-5-20250929
# export VNC_PROXY_MODE=proxy   # or 'direct' to bypass the reverse proxy
# export RETENTION_DAYS=7

# 4. Run
./scripts/dev_run.sh
```

## API

### `POST /tasks`

Create a task. The body is `multipart/form-data` with:
- `data` — JSON-encoded task spec (see schema below).
- `files` (optional, repeatable) — files copied into `data/tasks/{id}/input/files/`.

Spec fields:

| field | type | default | notes |
|---|---|---|---|
| `prompt` | string | required | What you want the agent to do (ignored for `kind=execution`). |
| `kind` | enum | `exploration` | `exploration` runs the Claude Computer Use loop. `execution` runs a bundle copied from `source_task_id`. |
| `source_task_id` | string? | `null` | Required when `kind=execution`. The task whose `output/workspace/` holds the bundle to run. |
| `model` | string | `DEFAULT_MODEL` | Any computer-use-capable Claude model. |
| `system_prompt_suffix` | string | `""` | Appended to the upstream desktop system prompt. |
| `max_iterations` | int | 50 | Soft cap (the upstream loop has no native iteration limit; container timeout is the hard cap). |
| `max_tokens` | int | 4096 | Per-turn `max_tokens`. |
| `tool_version` | string | `computer_use_20250124` | Pass `computer_use_20251124` for the newer Opus/Sonnet 4.x tools. |
| `only_n_most_recent_images` | int? | 3 | Image truncation for context-cost control. |
| `thinking_budget` | int? | null | Extended thinking budget tokens. |
| `timeout_seconds` | int | 1800 | Container is killed after this many seconds. |
| `env` | object | `{}` | Extra env vars for the container. Use `TASK_*` prefixes — keys matching obvious secret patterns are rejected. |
| `provider` | string | `anthropic` | `anthropic`, `bedrock`, or `vertex`. |

Returns `201` with a `TaskResponse`:

```json
{
  "id": "0a7c…",
  "status": "queued",
  "kind": "exploration",
  "prompt": "Open https://example.com",
  "model": "claude-sonnet-4-5-20250929",
  "vnc_url": null,
  "artifacts_url": "http://127.0.0.1:8000/tasks/0a7c…/artifacts",
  "created_at": "...",
  "started_at": null,
  "finished_at": null,
  "exit_code": null,
  "error": null,
  "result": null,
  "timeout_seconds": 1800
}
```

Once the task transitions to `running`, subsequent `GET /tasks/{id}` responses include a fresh `vnc_url` you can open in a browser.

### `GET /tasks/{id}`

Fetch the current state and (when terminal) the result + error.

### `GET /tasks?limit=50`

List recent tasks (newest first).

### `DELETE /tasks/{id}`

Request cancellation. Returns `202`. The runner stops the container and the task moves to `cancelled`.

### `PATCH /tasks/{id}`

Extend a running task's wall-clock budget. Body:

```json
{ "extra_seconds": 180 }
```

The runner re-reads `timeout_seconds` from SQLite every couple of seconds, so the new budget takes effect on the next tick. Returns `409` if the task is already in a terminal status.

### `GET /tasks/{id}/events`

Server-Sent-Events stream of the agent's trace records (`run_start`, `assistant_text`, `tool_use`, `tool_result`, `run_end`, …). Closes once the task reaches a terminal state.

### `GET /tasks/{id}/artifacts/{name}`

Download a file under the task directory: `output/result.json`, `output/error.json`, `output/trace.jsonl`, `output/reports/junit.xml`, `output/reports/screenshots/foo.png`, `logs/container.log`, etc. Path traversal is blocked.

### `GET /tasks/{id}/files`

List every file under the task directory (relative paths + size). Used by callers that want to enumerate before fetching.

### `GET /tasks/{id}/zip`

Stream a zip of `output/workspace/`. Used by orchestrators that want to download the agent's full workspace in one call.

### `GET /tasks/{id}/viewer?token=…`

Signed-URL HTML page that iframes the live noVNC client. The URL is returned as `vnc_url` once the task is `running`.

> **Note:** The noVNC server inside the sandbox typically takes ~15 seconds to boot. The `vnc_url` is returned as soon as Docker reports the container `running`, which can be earlier than that. If the iframe fails to load on first paint, refresh after a few seconds.

## Execution mode (`kind=execution`)

Used for running a pre-built test bundle. The flow:

1. Caller submits `POST /tasks` with `kind=execution` and `source_task_id`
   pointing at a task whose `output/workspace/` contains a runnable bundle
   (entrypoint `run.sh`, `manifest.json`, `tests/`, `reports/`).
2. The service copies that workspace into the new task's
   `data/tasks/{new_id}/input/bundle/`.
3. The runner sets `TASK_KIND=execution` on the container env. The
   image's `entrypoint.sh` dispatches to `/opt/runner/run_bundle.sh`
   instead of the Claude agent loop.
4. `run_bundle.sh` runs `bash /task/input/bundle/run.sh </dev/null`,
   captures `reports/junit.xml` + `reports/summary.json` +
   `reports/screenshots/`, copies them to `/task/output/reports/`, and
   writes a parsed summary to `/task/output/result.json`.
5. The harness exits 0 even when tests fail. Suite-level outcome lives
   in `result.json`; the caller decides pass/fail from `summary.failed`.

The runner image (`qa-sandbox:local`) ships with pytest, pytest-html,
pytest-playwright, and chromium pre-installed so bundles don't pay the
download cost on every execution.

## Examples

```bash
# Simple exploration task with a 5-minute cap
curl -X POST http://127.0.0.1:8000/tasks \
  -F 'data={"prompt":"Open https://example.com and describe what you see","timeout_seconds":300};type=application/json'
# => {"id":"0a7c…","status":"queued","kind":"exploration",...}

# Execution task — run the bundle from a previous exploration task
curl -X POST http://127.0.0.1:8000/tasks \
  -F 'data={"prompt":"Execute the bundle","kind":"execution","source_task_id":"0a7c…","timeout_seconds":600};type=application/json'

# With a file upload + env var
curl -X POST http://127.0.0.1:8000/tasks \
  -F 'data={"prompt":"Read /task/input/files/spec.pdf and run the test plan against $TASK_TARGET_URL","env":{"TASK_TARGET_URL":"https://staging.example.com"},"timeout_seconds":1200};type=application/json' \
  -F 'files=@spec.pdf'

# Extend a running task by 3 minutes
curl -X PATCH http://127.0.0.1:8000/tasks/0a7c… \
  -H 'content-type: application/json' \
  -d '{"extra_seconds":180}'

# Poll for completion
curl http://127.0.0.1:8000/tasks/0a7c…

# Watch the trace as it happens
curl -N http://127.0.0.1:8000/tasks/0a7c…/events
```

## Per-task layout on disk

Exploration task:

```
data/tasks/{task_id}/
├── input.json                # what the headless runner reads
├── input/
│   └── files/                # user-uploaded files
├── output/
│   ├── result.json           # on success
│   ├── error.json            # on failure
│   ├── trace.jsonl           # one record per assistant block + tool result
│   ├── screenshots/0001.png  # every screenshot the agent took
│   └── workspace/            # files the agent wrote (manifest.json, tests/, …)
└── logs/
    └── container.log         # captured container stdout/stderr (secrets redacted)
```

Execution task:

```
data/tasks/{task_id}/
├── input/
│   └── bundle/               # copy of source task's output/workspace/
│       ├── run.sh
│       ├── manifest.json
│       ├── tests/
│       └── reports/          # populated at runtime by run.sh
├── output/
│   ├── result.json           # parsed { summary, exit_code, duration_ms }
│   ├── reports/              # copy of bundle/reports after run.sh exits
│   │   ├── junit.xml
│   │   ├── report.html
│   │   ├── summary.json
│   │   └── screenshots/
│   └── run_bundle.log        # captured stdout/stderr of run.sh
└── logs/
    └── container.log
```

## Configuration reference

| env var | default | description |
|---|---|---|
| `ANTHROPIC_API_KEY` | required | Forwarded to the sandbox container. |
| `TOKEN_SECRET` | required | HMAC key used to sign viewer URLs. |
| `SANDBOX_IMAGE` | `qa-sandbox:local` | Built by `scripts/build_image.sh`. |
| `SANDBOX_MEM_LIMIT` | `2g` | Per-container memory cap. |
| `SANDBOX_CPUS` | `1.0` | Per-container CPU cap. |
| `SANDBOX_NETWORK` | unset | Optional Docker network name. |
| `WIDTH` / `HEIGHT` | `1280` / `800` | Virtual display size inside the container. |
| `MAX_CONCURRENT_TASKS` | `2` | Concurrency cap; overflow waits in `queued`. |
| `DEFAULT_TIMEOUT_SECONDS` | `1800` | Default per-task timeout. |
| `RETENTION_DAYS` | `7` | Terminal tasks older than this are swept hourly. Set `0` to disable. |
| `DATA_DIR` | `./data` | Where SQLite + per-task artifacts live. |
| `PUBLIC_BASE_URL` | `http://127.0.0.1:8000` | Used to build absolute `vnc_url`s. |
| `VNC_PROXY_MODE` | `proxy` | `proxy` (default, recommended) or `direct`. |
| `VNC_BIND_HOST` | `127.0.0.1` | Host interface noVNC ports are bound to. |
| `TOKEN_TTL_SECONDS` | `7200` | Viewer URL lifetime. |
| `DEFAULT_MODEL` | `claude-sonnet-4-5-20250929` | Default Claude model. |

## Tests

```bash
.venv/bin/pytest -q
```

The full suite runs without Docker (the docker layer is mocked in the API tests). End-to-end tests against a real sandbox container are out of scope for the unit suite; spin one up manually with `scripts/build_image.sh` then `scripts/dev_run.sh`.

## License

PolyForm Noncommercial 1.0.0. See [`LICENSE`](../../LICENSE) at the repo root.
