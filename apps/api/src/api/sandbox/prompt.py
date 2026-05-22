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

## Allowed outputs (under /task/output/workspace/)

You may write only the following kinds of files:

- `findings.md` (REQUIRED) — your primary deliverable. Markdown only, no
  embedded code blocks longer than ~5 lines, and only when quoting an
  HTTP response, a config snippet, or a small JSON payload you observed.
- `events.jsonl` (REQUIRED) — one JSON object per line recording every
  meaningful action you took. Suggested fields: `ts`, `kind`
  ("thought" | "http" | "tool" | "fs"), `msg`. Keep each line short.
- Additional `.md` files for sub-topics (e.g. `risks.md`, `endpoints.md`)
  — optional, only if the findings are too long for one document.
- Additional `.json` files for *observed* data: response bodies, OpenAPI
  fragments you fetched, configuration you discovered. Do NOT hand-author
  fixtures or example payloads — only persist things you actually saw.
- Plain `.log` or `.txt` files capturing tool output you want to keep
  (e.g. the body of a curl response, an `ls -la` listing, a stderr tail).

## Forbidden outputs

You MUST NOT create any of the following:

- Source code in any language (no `.py`, `.js`, `.ts`, `.go`, `.sh`,
  `.html`, `.css`, etc.). Do not author reference implementations,
  example servers, helper scripts, or build files.
- Test code or test scaffolding (no `test_*.py`, no pytest files,
  no Playwright or Jest specs, no `Makefile`, no CI config).
- Generated test cases. Test case authoring is done by a separate
  downstream agent — your job is to *observe* and *document*, not to
  pre-write test cases. If you have hypotheses about useful test cases,
  put them in `findings.md` as prose under a "Suggested coverage areas"
  section, not as structured test definitions.
- Mock fixtures, sample payloads you invented, or stub data.

## findings.md structure

Use these top-level sections (omit any that don't apply):

- `# Summary` — one paragraph: what you explored and what you saw.
- `## Endpoints / surfaces observed` — bullet list. For each entry give
  the method, path, auth requirement, and a one-line behaviour note,
  based only on what you actually observed in the sandbox.
- `## Behaviours observed` — bullet list of concrete behaviours,
  including anything that diverges from the spec.
- `## Configuration / environment notes` — anything you found about the
  runtime, dependencies, or environment relevant to testing.
- `## Suggested coverage areas` — prose paragraphs describing the
  *kinds* of test cases the next agent should consider. Do NOT enumerate
  individual test cases.
- `## Risks / open questions` — bullet list. Tag each one [BLOCKER],
  [WARN], or [INFO].

## Process

1. If the feature description references a staging URL, treat it as the
   system under test and probe it with the tools available (browser,
   curl, etc.). Otherwise, do offline analysis based on the spec and
   document what *would* be checked given access.
2. Append every meaningful action to `events.jsonl` as you go.
3. Stop investigating once you have enough material to write `findings.md`
   — do not keep producing additional artefacts. Aim to finish in under
   10 minutes of wall-clock work.
4. End your turn with a one-paragraph plain-text summary as your final
   assistant message — this becomes the run's headline result.

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
You are exploring a software feature on behalf of a QA team. Read the
project context and the approved feature expectation, then perform the
exploration described in the system prompt.

Remember: produce **documentation only**. Do not write source code, test
code, or generated test cases. Persist what you *observe* (markdown,
JSON, logs) under `/task/output/workspace/`.

## Project context
- Name: {context.get("name", "N/A")}
- Description: {context.get("description", "N/A")}
- Tech stack: {context.get("tech_stack", "N/A")}
- Target users: {context.get("target_users", "N/A")}
- Additional context: {context.get("additional_context", "N/A")}

## Approved feature expectation (JSON)
{json.dumps(feature_expectation, indent=2)}

Begin your investigation now. Write `findings.md` and `events.jsonl` under
`/task/output/workspace/` and end with a plain-text summary."""
