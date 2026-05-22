# Architecture & Plan

Local-first, single-tenant service that spins up Anthropic's Computer Use reference container on demand.

## Decisions

- Agent loop runs **inside** the sandbox container (uses upstream `computer_use_demo.loop.sampling_loop`).
- Single Docker host, accessed via the local Docker daemon (`/var/run/docker.sock`).
- Job-style sessions: one task = one container, torn down on completion.
- Async API: `POST /tasks` returns a task id; clients poll `GET /tasks/{id}`.
- Live view: noVNC over a signed-URL HTTP+WS reverse proxy in the FastAPI service (with an opt-in direct-port mode for local dev).
- Stack: Python 3.11+, FastAPI, SQLite, docker-py.
- Concurrency: configurable cap (default 2), FIFO queue for overflow.
- Persistence: local filesystem under `data/tasks/{id}/` + SQLite for task metadata.

## Sandbox image

`FROM ghcr.io/anthropics/anthropic-quickstarts:computer-use-demo-latest`

Adds a headless entrypoint that:

1. Starts the upstream X11/Xvfb/noVNC stack (skipping Streamlit).
2. Reads `/task/input.json` (prompt, model, env, max_iterations, timeout).
3. Runs `computer_use_demo.loop.sampling_loop` with hooks that snapshot screenshots and append to a JSONL trace.
4. Writes `/task/output/result.json` (or `error.json`) and exits.

`/task` is a host bind-mount to `data/tasks/{id}/`.

## Service responsibilities

- Validate task input + uploads.
- Allocate task id, write input JSON + files to the task dir.
- Run the container with the right env, mounts, resource limits, network.
- Track state in SQLite (`queued → starting → running → succeeded|failed|timeout|cancelled`).
- Stream the noVNC web client through a signed-URL reverse proxy.
- Persist screenshots, logs, trace, final result.
- Clean up containers on shutdown / orphan sweep on startup.

## Milestones

1. **M1** — Sandbox image + headless entrypoint. Verify with a manual `docker run`.
2. **M2** — FastAPI skeleton, SQLite, container spawn for `POST /tasks`, `GET /tasks/{id}`.
3. **M3** — noVNC live view (direct-port + signed-URL proxy modes).
4. **M4** — Robustness: timeouts, cancellation, concurrency cap with queue, orphan sweep, log capture, retention.
5. **M5** — SSE trace stream, README polish, integration tests against a mock Anthropic backend.
