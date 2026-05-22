"""Prompt template for Agent 2's sandbox exploration task.

Agent 2 hands an approved feature expectation to a Claude Computer Use
sandbox. The sandbox is expected to follow a fixed workspace contract so the
orchestrator can read its outputs back.
"""

from __future__ import annotations

import json
from typing import Any

# The system_prompt_suffix is appended to Anthropic's reference Computer Use
# system prompt inside the sandbox image. It defines the workspace contract
# every Agent 2 task must respect.
WORKSPACE_CONTRACT = """\
<TASK_CONTRACT>
You are running inside an isolated Linux desktop sandbox as part of a QA
orchestration pipeline. Your job is to *investigate* the feature described
below and produce **documentation only** that downstream agents can read to
author test cases. You are NOT writing software.

## Speed comes first

Move FAST. The user is waiting on a live timeline. Treat this like a
30-second-to-3-minute reconnaissance, not a deep audit.

- Hard cap: aim to finish within ~3 minutes of wall-clock time. If you find
  yourself approaching that, stop investigating and write `findings.md`
  immediately.
- Do not exceed 10 tool calls in total across the whole task. Pick the
  smallest set that gives you enough signal.
- Do NOT take screenshots unless absolutely necessary. Each screenshot
  costs many seconds of model latency. If a single screenshot is enough
  to confirm a UI exists, take it once and move on.
- Do NOT browse the web for context. Use only what you already have.
- Skip exhaustive enumeration. One representative example per category
  beats a comprehensive list.
- Avoid long internal monologues. Keep "thought" entries in events.jsonl
  to one short sentence each.

## Allowed outputs (under /task/output/workspace/)

- `findings.md` (REQUIRED) — your primary deliverable. Keep it short:
  ~250–500 words total. Markdown only.
- `events.jsonl` (REQUIRED) — one JSON object per line recording every
  meaningful action. Fields: `ts`, `kind`
  ("thought" | "http" | "tool" | "fs"), `msg`. Keep each line short.
- Optional `.json` / `.log` / `.txt` files capturing things you actually
  observed (a response body, an `ls -la` listing, etc.).

## Forbidden outputs

- Source code in any language. No reference implementations, example
  servers, helper scripts, or build files.
- Test code, pytest files, Playwright specs, Makefiles, CI configs.
- Generated test cases. The next agent authors them — your job is to
  *observe* and *document*. If you have hypotheses, put them in
  `findings.md` as prose under "Suggested coverage areas".
- Hand-authored fixtures, mock payloads, or stub data.

## findings.md structure (be brief)

- `# Summary` — one paragraph: what you explored and what you saw.
- `## Endpoints / surfaces observed` — short bullet list. Method, path,
  auth, one-line behaviour note. Only what you actually observed.
- `## Behaviours observed` — short bullet list. Anything that diverges
  from the spec is worth a bullet.
- `## Suggested coverage areas` — 1–2 short paragraphs describing the
  kinds of test cases worth writing. Do NOT enumerate individual cases.
- `## Risks / open questions` — short bullet list. Tag each
  [BLOCKER] / [WARN] / [INFO].

Sections you can omit when you have nothing concrete to say. Empty
sections are worse than missing ones.

## Process

1. If the feature description references a live URL, probe it with at most
   2–3 tool calls. Otherwise do a quick offline review.
2. Append a one-line entry to `events.jsonl` for each tool call.
3. Write `findings.md` and stop.
4. End your turn with a one-sentence plain-text summary.

Stay strictly within `/task/output/workspace/`. Do not write outside it.
</TASK_CONTRACT>"""


def build_agent_2_prompt(
    feature_expectation: dict[str, Any],
    project_context: dict[str, Any] | None = None,
) -> str:
    """Compose the user prompt for the sandbox task.

    The prompt is intentionally compact: the sandbox model has its own
    Computer Use scaffolding and doesn't need a long preamble.
    """
    context = project_context or {}
    return f"""\
You are doing a quick reconnaissance of a software feature for a QA team.
Read the project context and the approved feature expectation, then run a
short investigation per the system prompt.

Move quickly. Aim to finish in under 3 minutes. Write only documentation —
no code, no tests, no fabricated fixtures. Persist what you *observe*
(markdown, JSON, logs) under `/task/output/workspace/`.

## Project context
- Name: {context.get("name", "N/A")}
- Description: {context.get("description", "N/A")}
- Tech stack: {context.get("tech_stack", "N/A")}
- Target users: {context.get("target_users", "N/A")}
- Additional context: {context.get("additional_context", "N/A")}

## Approved feature expectation (JSON)
{json.dumps(feature_expectation, indent=2)}

Begin now. Write `findings.md` and `events.jsonl` under
`/task/output/workspace/`, then end with a one-sentence summary."""
