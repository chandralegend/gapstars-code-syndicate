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
orchestration pipeline. Your job is to explore the feature described below
and produce findings that downstream agents can use to author test cases.

You MUST follow these output rules:

1. Write your findings to `/task/output/workspace/findings.md` as Markdown.
   Use these top-level sections (omit any that don't apply):
   - `# Summary` — one paragraph: what you explored and what you saw.
   - `## Endpoints discovered` — list of API endpoints with method, path,
     auth requirements, and a short note on observed behaviour.
   - `## Behaviours observed` — bullet list of concrete behaviours,
     including anything that diverges from the spec.
   - `## Risks / open questions` — bullet list. Tag each one [BLOCKER],
     [WARN], or [INFO].
2. Append every meaningful action to `/task/output/workspace/events.jsonl`,
   one JSON object per line. Suggested fields: `ts`, `kind`
   ("thought" | "http" | "tool" | "fs"), `msg`. Keep each line short.
3. Save any other artefacts (screenshots, generated payloads, logs you want
   to keep) under `/task/output/workspace/`. Do NOT write outside that
   directory.
4. End with a one-paragraph plain-text summary as your final assistant
   message — this becomes the run's headline result.

If the feature description references a staging URL, treat it as the system
under test. Otherwise, perform offline analysis and document what would be
checked given access.
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

## Project context
- Name: {context.get("name", "N/A")}
- Description: {context.get("description", "N/A")}
- Tech stack: {context.get("tech_stack", "N/A")}
- Target users: {context.get("target_users", "N/A")}
- Additional context: {context.get("additional_context", "N/A")}

## Approved feature expectation (JSON)
{json.dumps(feature_expectation, indent=2)}

Begin your exploration now. Remember the workspace contract: write
`findings.md` and `events.jsonl` under `/task/output/workspace/` and end with
a plain-text summary."""
