"""Headless agent runner used inside the sandbox container.

Reads /task/input.json, runs computer_use_demo.loop.sampling_loop, and writes
results to /task/output/.

Input schema (JSON):
    {
      "prompt": "...",                       # required
      "model": "claude-opus-4-7",            # optional, default below
      "system_prompt_suffix": "...",         # optional
      "max_iterations": 50,                  # optional
      "max_tokens": 4096,                    # optional
      "tool_version": "computer_use_20250124"# optional, default below
      "only_n_most_recent_images": 3,        # optional
      "thinking_budget": null,               # optional
      "provider": "anthropic"                # optional
    }

Outputs under /task/output/:
    result.json        on success
    error.json         on failure
    trace.jsonl        line-delimited record of every assistant block + tool result
    screenshots/NNN.png  every screenshot captured during the run
    .ready             touched once the runner is ready (used for healthchecks)
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import sys
import traceback
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

TASK_DIR = Path(os.environ.get("TASK_DIR", "/task"))
INPUT_PATH = TASK_DIR / "input.json"
OUTPUT_DIR = TASK_DIR / "output"
SCREENSHOT_DIR = OUTPUT_DIR / "screenshots"
WORKSPACE_DIR = OUTPUT_DIR / "workspace"
TRACE_PATH = OUTPUT_DIR / "trace.jsonl"
RESULT_PATH = OUTPUT_DIR / "result.json"
ERROR_PATH = OUTPUT_DIR / "error.json"
READY_FLAG = OUTPUT_DIR / ".ready"

DEFAULT_MODEL = "claude-sonnet-4-5-20250929"
DEFAULT_TOOL_VERSION = "computer_use_20250124"
DEFAULT_MAX_ITERATIONS = 50
DEFAULT_MAX_TOKENS = 4096

# Appended to the user's system_prompt_suffix so the agent always knows
# where to put files it produces. /task/output/workspace is bind-mounted back
# to the host, so anything written there is returned to the API caller.
WORKSPACE_INSTRUCTIONS = """\
<WORKSPACE>
You have a writable workspace directory at /task/output/workspace. \
Save any files you produce (notes, summaries, downloads, exported reports, \
screenshots you capture intentionally, etc.) inside that directory. \
The contents of /task/output/workspace will be returned to the user when the \
task completes. Use absolute paths starting with /task/output/workspace/.
</WORKSPACE>"""


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_dirs() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)


def _load_input() -> dict[str, Any]:
    if not INPUT_PATH.exists():
        raise RuntimeError(f"missing input file: {INPUT_PATH}")
    with INPUT_PATH.open() as f:
        data = json.load(f)
    if not isinstance(data, dict) or not data.get("prompt"):
        raise RuntimeError("input.json must be an object with a non-empty 'prompt'")
    return data


def _append_trace(record: dict[str, Any]) -> None:
    record = {"ts": _utcnow(), **record}
    with TRACE_PATH.open("a") as f:
        f.write(json.dumps(record, default=str) + "\n")


@dataclass
class TraceState:
    screenshot_index: int = 0
    iteration: int = 0
    api_error: str | None = None


def build_callbacks(state: TraceState):
    """Build the three callbacks the upstream loop expects."""

    def output_callback(block):  # BetaContentBlockParam
        try:
            if isinstance(block, dict):
                btype = block.get("type")
                if btype == "text":
                    _append_trace({"kind": "assistant_text", "text": block.get("text")})
                elif btype == "tool_use":
                    _append_trace(
                        {
                            "kind": "tool_use",
                            "name": block.get("name"),
                            "input": block.get("input"),
                            "id": block.get("id"),
                        }
                    )
                elif btype == "thinking":
                    _append_trace({"kind": "thinking"})
                else:
                    _append_trace({"kind": "assistant_block", "type": btype})
        except Exception as exc:  # never let logging break the loop
            _append_trace({"kind": "trace_error", "where": "output_callback", "err": str(exc)})

    def tool_output_callback(result, tool_use_id):  # ToolResult
        try:
            entry: dict[str, Any] = {
                "kind": "tool_result",
                "tool_use_id": tool_use_id,
                "error": getattr(result, "error", None),
                "system": getattr(result, "system", None),
            }
            output = getattr(result, "output", None)
            if output:
                entry["output"] = (output[:2000] + "…") if len(output) > 2000 else output

            b64 = getattr(result, "base64_image", None)
            if b64:
                state.screenshot_index += 1
                fname = f"{state.screenshot_index:04d}.png"
                path = SCREENSHOT_DIR / fname
                path.write_bytes(base64.b64decode(b64))
                entry["screenshot"] = f"screenshots/{fname}"
            _append_trace(entry)
        except Exception as exc:
            _append_trace({"kind": "trace_error", "where": "tool_output_callback", "err": str(exc)})

    def api_response_callback(request, response, error):
        try:
            entry: dict[str, Any] = {"kind": "api_response"}
            status_code = None
            if response is not None and hasattr(response, "status_code"):
                status_code = response.status_code
                entry["status_code"] = status_code
            if error is not None:
                entry["error"] = repr(error)
                # The upstream sampling_loop swallows API errors and returns
                # silently. We surface them so the headless runner can fail
                # the task instead of writing a misleading "succeeded".
                if state.api_error is None:
                    state.api_error = repr(error)
            elif status_code is not None and status_code >= 400:
                entry["error"] = f"HTTP {status_code}"
                if state.api_error is None:
                    state.api_error = f"HTTP {status_code}"
            _append_trace(entry)
            state.iteration += 1
        except Exception as exc:
            _append_trace({"kind": "trace_error", "where": "api_response_callback", "err": str(exc)})

    return output_callback, tool_output_callback, api_response_callback


async def _run(spec: dict[str, Any]) -> dict[str, Any]:
    # Imports happen here so that input-validation errors are reported even if
    # the upstream package is missing for some reason.
    from computer_use_demo.loop import APIProvider, sampling_loop  # type: ignore

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY env var is required")

    provider_str = spec.get("provider", "anthropic")
    try:
        provider = APIProvider(provider_str)
    except ValueError as e:
        raise RuntimeError(f"unknown provider: {provider_str}") from e

    state = TraceState()
    output_cb, tool_cb, api_cb = build_callbacks(state)

    messages: list[dict[str, Any]] = [
        {
            "role": "user",
            "content": spec["prompt"],
        }
    ]

    max_iterations = int(spec.get("max_iterations", DEFAULT_MAX_ITERATIONS))
    max_tokens = int(spec.get("max_tokens", DEFAULT_MAX_TOKENS))

    _append_trace(
        {
            "kind": "run_start",
            "model": spec.get("model", DEFAULT_MODEL),
            "tool_version": spec.get("tool_version", DEFAULT_TOOL_VERSION),
            "max_iterations": max_iterations,
        }
    )

    # The upstream sampling_loop runs until the model stops calling tools (no
    # built-in iteration cap), so we wrap each iteration ourselves by bounding
    # the time and tool-call count via a watchdog. For v1 we trust the upstream
    # loop and rely on the container-level timeout enforced by the API service.
    user_suffix = spec.get("system_prompt_suffix", "") or ""
    combined_suffix = (user_suffix + "\n\n" + WORKSPACE_INSTRUCTIONS).strip()

    final_messages = await sampling_loop(
        model=spec.get("model", DEFAULT_MODEL),
        provider=provider,
        system_prompt_suffix=combined_suffix,
        messages=messages,
        output_callback=output_cb,
        tool_output_callback=tool_cb,
        api_response_callback=api_cb,
        api_key=api_key,
        only_n_most_recent_images=spec.get("only_n_most_recent_images"),
        max_tokens=max_tokens,
        tool_version=spec.get("tool_version", DEFAULT_TOOL_VERSION),
        thinking_budget=spec.get("thinking_budget"),
        token_efficient_tools_beta=bool(spec.get("token_efficient_tools_beta", False)),
    )

    # Upstream's sampling_loop swallows API errors. Surface them.
    if state.api_error is not None:
        raise RuntimeError(f"API error from Anthropic: {state.api_error}")

    final_text = _extract_final_text(final_messages)

    workspace_files = _list_workspace()

    return {
        "status": "succeeded",
        "final_text": final_text,
        "screenshot_count": state.screenshot_index,
        "iterations": state.iteration,
        "message_count": len(final_messages),
        "workspace_files": workspace_files,
    }


def _list_workspace() -> list[dict[str, Any]]:
    """Enumerate files the agent dropped under /task/output/workspace/."""
    out: list[dict[str, Any]] = []
    if not WORKSPACE_DIR.exists():
        return out
    for p in sorted(WORKSPACE_DIR.rglob("*")):
        if p.is_file():
            try:
                size = p.stat().st_size
            except OSError:
                size = -1
            out.append(
                {
                    "path": str(p.relative_to(OUTPUT_DIR)),  # e.g. "workspace/summary.md"
                    "size": size,
                }
            )
    return out


def _extract_final_text(messages: list[dict[str, Any]]) -> str:
    """Pull the last assistant text block from the message log, if any."""
    for msg in reversed(messages):
        if msg.get("role") != "assistant":
            continue
        content = msg.get("content")
        if isinstance(content, list):
            texts = [b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"]
            if texts:
                return "\n".join(t for t in texts if t)
        elif isinstance(content, str):
            return content
    return ""


def main() -> int:
    _ensure_dirs()
    READY_FLAG.write_text(_utcnow())

    try:
        spec = _load_input()
    except Exception as exc:
        _write_error("invalid_input", str(exc))
        return 2

    try:
        result = asyncio.run(_run(spec))
    except KeyboardInterrupt:
        _write_error("cancelled", "interrupted")
        return 130
    except Exception as exc:
        _write_error("runtime_error", str(exc), traceback.format_exc())
        return 1

    RESULT_PATH.write_text(json.dumps(result, indent=2))
    _append_trace({"kind": "run_end", "status": result["status"]})
    return 0


def _write_error(kind: str, message: str, tb: str | None = None) -> None:
    payload = {
        "status": "failed",
        "kind": kind,
        "message": message,
        "ts": _utcnow(),
    }
    if tb:
        payload["traceback"] = tb
    ERROR_PATH.write_text(json.dumps(payload, indent=2))
    _append_trace({"kind": "run_error", **payload})


if __name__ == "__main__":
    sys.exit(main())
