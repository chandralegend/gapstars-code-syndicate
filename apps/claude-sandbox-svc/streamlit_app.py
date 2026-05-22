"""Streamlit UI for claude-sandbox-svc.

Lets you submit a task, watch the live noVNC view, follow the agent's trace,
and download any files the agent produces under /task/output/workspace/.

Run with:
    pip install -e '.[ui]'
    streamlit run streamlit_app.py
"""

from __future__ import annotations

import json
import os
import time
from typing import Any

import requests
import streamlit as st

API_URL = os.environ.get("SANDBOX_API_URL", "http://127.0.0.1:8000").rstrip("/")
POLL_INTERVAL = 2.0
TERMINAL = {"succeeded", "failed", "timeout", "cancelled"}


# ---- API helpers -------------------------------------------------------------


def api_get(path: str) -> dict | list | None:
    r = requests.get(f"{API_URL}{path}", timeout=15)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return r.json()


def api_post_task(spec: dict[str, Any]) -> dict:
    r = requests.post(
        f"{API_URL}/tasks",
        files={"data": (None, json.dumps(spec), "application/json")},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def api_delete_task(task_id: str) -> dict:
    r = requests.delete(f"{API_URL}/tasks/{task_id}", timeout=10)
    r.raise_for_status()
    return r.json()


def fetch_artifact_bytes(task_id: str, path: str) -> bytes | None:
    r = requests.get(f"{API_URL}/tasks/{task_id}/artifacts/{path}", timeout=15)
    if r.status_code != 200:
        return None
    return r.content


# ---- UI ----------------------------------------------------------------------


st.set_page_config(page_title="claude-sandbox-svc", layout="wide")
st.title("claude-sandbox-svc")
st.caption(f"Talking to: `{API_URL}`")

# Health check
try:
    api_get("/healthz")
    health_ok = True
except Exception as e:
    health_ok = False
    st.error(f"API not reachable at {API_URL}: {e}")

if not health_ok:
    st.stop()


# --- Sidebar: task creation ---
with st.sidebar:
    st.header("New task")

    prompt = st.text_area(
        "Prompt",
        height=200,
        value=(
            "Open Firefox, go to google.com, search for 'sport news', read the "
            "top 3 results, and write a markdown summary at "
            "/task/output/workspace/summary.md. Then take a final screenshot."
        ),
    )

    col_a, col_b = st.columns(2)
    with col_a:
        max_iterations = st.number_input("Max iterations", 1, 200, 30)
        timeout_seconds = st.number_input("Timeout (s)", 60, 24 * 3600, 900, step=60)
    with col_b:
        model = st.text_input("Model", "claude-sonnet-4-5-20250929")
        tool_version = st.selectbox(
            "Tool version", ["computer_use_20250124", "computer_use_20251124"], index=0
        )

    only_n = st.number_input("Keep only N most recent images", 0, 20, 3)

    submit = st.button("Submit task", type="primary", use_container_width=True)

    if submit:
        spec = {
            "prompt": prompt,
            "model": model,
            "max_iterations": int(max_iterations),
            "timeout_seconds": int(timeout_seconds),
            "tool_version": tool_version,
            "only_n_most_recent_images": int(only_n) if only_n else None,
        }
        try:
            created = api_post_task(spec)
            st.session_state["task_id"] = created["id"]
            st.session_state["last_status"] = created["status"]
            st.success(f"Submitted: {created['id'][:8]}…")
        except Exception as e:
            st.error(f"Submit failed: {e}")

    st.divider()
    st.header("Recent tasks")
    try:
        tasks = api_get("/tasks?limit=20") or []
        for t in tasks:
            label = f"{t['id'][:8]} · {t['status']}"
            if st.button(label, key=f"select-{t['id']}", use_container_width=True):
                st.session_state["task_id"] = t["id"]
                st.session_state["last_status"] = t["status"]
    except Exception as e:
        st.warning(f"Could not list tasks: {e}")


# --- Main area: selected task ---
task_id = st.session_state.get("task_id")
if not task_id:
    st.info("Submit a task on the left, or pick a recent task to view it here.")
    st.stop()

task = api_get(f"/tasks/{task_id}")
if task is None:
    st.error(f"Task {task_id} not found")
    st.stop()

status = task["status"]
st.session_state["last_status"] = status

header_cols = st.columns([3, 1, 1])
with header_cols[0]:
    st.subheader(f"Task `{task_id[:8]}…`  ·  status: **{status}**")
    st.caption(task["prompt"])
with header_cols[1]:
    if status not in TERMINAL:
        if st.button("Cancel", type="secondary", use_container_width=True):
            try:
                api_delete_task(task_id)
                st.toast("Cancellation requested")
            except Exception as e:
                st.error(f"Cancel failed: {e}")
with header_cols[2]:
    if st.button("Refresh", use_container_width=True):
        st.rerun()

# Layout: left = live view + final result; right = trace + files
left, right = st.columns([3, 2])

# ----- Left column: live view & final output -----
with left:
    st.markdown("### Live view")
    if task.get("vnc_url"):
        # Embed via iframe; user clicks Open in new tab if blocked.
        st.components.v1.iframe(task["vnc_url"], height=600, scrolling=True)
        st.caption(f"[Open viewer in new tab]({task['vnc_url']})")
    else:
        st.info("Live view appears once the sandbox is running.")

    if status in TERMINAL:
        st.markdown("### Result")
        if task.get("result"):
            res = task["result"]
            ft = res.get("final_text") or "(no final text)"
            st.markdown(f"**Final assistant message**\n\n{ft}")
            st.json(
                {k: v for k, v in res.items() if k != "final_text"},
                expanded=False,
            )
        if task.get("error"):
            st.error(task["error"])

# ----- Right column: trace + artifacts -----
with right:
    st.markdown("### Trace")
    trace_bytes = fetch_artifact_bytes(task_id, "output/trace.jsonl")
    if trace_bytes:
        records: list[dict[str, Any]] = []
        for line in trace_bytes.decode("utf-8", "replace").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                records.append({"raw": line})
        # Show newest first, limit to last 40
        with st.container(height=320):
            for r in records[-40:]:
                kind = r.get("kind", "?")
                ts = r.get("ts", "")[:19]
                if kind == "assistant_text":
                    text = (r.get("text") or "")[:400]
                    st.markdown(f"`{ts}` **assistant** — {text}")
                elif kind == "tool_use":
                    st.markdown(
                        f"`{ts}` 🔧 **{r.get('name')}** "
                        f"`{json.dumps(r.get('input'))[:140]}`"
                    )
                elif kind == "tool_result":
                    snippet = (r.get("output") or "")[:200]
                    err = r.get("error")
                    if err:
                        st.markdown(f"`{ts}` ⚠️ tool error — {err[:200]}")
                    else:
                        st.markdown(f"`{ts}` ✅ tool result — {snippet}")
                elif kind == "api_response":
                    code = r.get("status_code", "")
                    err = r.get("error")
                    if err:
                        st.markdown(f"`{ts}` 🔴 api {code} — {err[:160]}")
                    else:
                        st.markdown(f"`{ts}` 🟢 api {code}")
                elif kind == "run_start":
                    st.markdown(f"`{ts}` 🚀 run_start  model=`{r.get('model')}`")
                elif kind == "run_end":
                    st.markdown(f"`{ts}` 🏁 run_end status=`{r.get('status')}`")
                elif kind == "runtime_error":
                    st.markdown(f"`{ts}` 💥 runtime_error — {r.get('message')}")
                else:
                    st.markdown(f"`{ts}` {kind}")
    else:
        st.caption("Trace will appear once the sandbox starts producing events.")

    st.markdown("### Files produced by the agent")
    files_resp = api_get(f"/tasks/{task_id}/files") or {}
    files = files_resp.get("files", [])
    workspace_files = [f for f in files if f["path"].startswith("output/workspace/")]
    other_outputs = [
        f
        for f in files
        if f["path"].startswith("output/")
        and not f["path"].startswith("output/workspace/")
        and not f["path"].startswith("output/screenshots/")
    ]
    screenshots = [f for f in files if f["path"].startswith("output/screenshots/")]

    if workspace_files:
        st.write("**Workspace** (files the agent saved):")
        for f in workspace_files:
            rel = f["path"].removeprefix("output/workspace/")
            data = fetch_artifact_bytes(task_id, f["path"])
            if data is None:
                continue
            cols = st.columns([3, 1])
            with cols[0]:
                st.caption(f"📄 {rel} ({f['size']} bytes)")
                if rel.endswith((".md", ".txt", ".json", ".csv", ".log")):
                    with st.expander(f"Preview {rel}", expanded=rel.endswith(".md")):
                        text = data.decode("utf-8", "replace")
                        if rel.endswith(".md"):
                            st.markdown(text)
                        else:
                            st.code(text[:5000])
                elif rel.lower().endswith((".png", ".jpg", ".jpeg")):
                    st.image(data, caption=rel)
            with cols[1]:
                st.download_button(
                    "Download",
                    data,
                    file_name=rel,
                    key=f"dl-ws-{f['path']}",
                    use_container_width=True,
                )
    elif status in TERMINAL:
        st.caption("Agent did not produce any workspace files.")
    else:
        st.caption("Workspace is empty so far.")

    if screenshots:
        with st.expander(f"Screenshots ({len(screenshots)})"):
            for f in screenshots[-12:]:
                data = fetch_artifact_bytes(task_id, f["path"])
                if data is not None:
                    st.image(data, caption=f["path"])

    if other_outputs:
        with st.expander("Other artifacts"):
            for f in other_outputs:
                cols = st.columns([3, 1])
                cols[0].caption(f"{f['path']} ({f['size']} bytes)")
                data = fetch_artifact_bytes(task_id, f["path"])
                if data is not None:
                    cols[1].download_button(
                        "Download",
                        data,
                        file_name=f["path"].split("/")[-1],
                        key=f"dl-o-{f['path']}",
                        use_container_width=True,
                    )

# Auto-refresh while the task is in flight.
if status not in TERMINAL:
    time.sleep(POLL_INTERVAL)
    st.rerun()
