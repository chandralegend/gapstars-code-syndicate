"""Prompt template for Agent 4 — script-bundle generator.

Agent 4 reads the approved test cases from a completed run plus the
feature expectation, and produces a runnable test-script bundle inside
the claude-sandbox-svc workspace. The bundle has a single entrypoint
(``run.sh``) and is framework-agnostic from the caller's perspective.
"""

from __future__ import annotations

import json
from typing import Any

# Appended to the sandbox image's system prompt so the agent stays
# strictly inside the canonical layout.
BUNDLE_CONTRACT = """\
<TASK_CONTRACT>
You are running inside an isolated Linux sandbox. Your job is to
produce a runnable, framework-agnostic test bundle that exercises the
approved test cases provided below.

## Single-entrypoint contract — STRICT

Every bundle you produce MUST follow this layout under
``/task/output/workspace/``:

  - ``run.sh``         POSIX shell. Runs the chosen test framework.
                       Top of file: ``set -euo pipefail``. Installs
                       any missing dependencies inline. Writes a JUnit
                       XML report to ``reports/junit.xml`` and a
                       one-line summary to ``reports/summary.json``
                       with shape::
                         { "framework": "...", "total": N, "passed": N,
                           "failed": N, "skipped": N, "duration_s": N,
                           "exit_code": N }
                       Exits with the framework's exit code.
  - ``manifest.json``  Machine-readable description (schema below).
  - ``README.md``      Short human-readable description + how to run.
  - ``tests/``         Framework-native test files.
  - ``reports/``       Directory with a single ``.gitkeep`` initially.
                       run.sh populates this at run-time.

The caller will only ever invoke ``bash run.sh``. Anything else
(dependencies, fixtures, config) must be wired in by ``run.sh``. There
is exactly ONE entrypoint — do not produce additional driver scripts.

## Framework choice

Pick ONE framework appropriate for the project's tech stack. Default
matrix:

  - Python / FastAPI / REST API     -> pytest (+ httpx / requests)
  - Browser flows that click        -> Playwright (Python preferred,
                                        Node also fine)
  - Node / TypeScript unit tests    -> vitest
  - Anything ambiguous              -> pytest

Use the simplest tooling that covers the cases. Prefer pytest unless
the cases obviously need a real browser.

## manifest.json schema

  {
    "schema_version": 1,
    "framework": "pytest" | "playwright" | "vitest" | ...,
    "language": "python" | "node" | "typescript" | ...,
    "entrypoint": "./run.sh",
    "test_count": <int>,
    "test_cases": [
      {
        "id": "<input test-case UUID, copy verbatim>",
        "title": "<copied from input>",
        "test_path": "tests/foo.py::test_bar"
      },
      ...
    ],
    "runtime": { "python": "3.11" }    // or { "node": "20" }, etc.
    "env": { "required": [], "optional": [] }
  }

``test_cases[].id`` MUST equal the input UUID so downstream tooling can
map results back to the original case.

## Forbidden

- Hand-fabricated fixtures that have no input case backing them.
- Cases with ``status != "approved"``. Generate scripts only for
  approved cases.
- Tests that depend on internet access at run time, unless the input
  case explicitly describes that.
- Multiple entrypoints. Exactly one ``run.sh``.
- Documentation-only output. Test code is required.

## Speed

Aim for under 5 minutes wall-clock. ~10 tool calls maximum. Do NOT
take screenshots — there is no UI to observe. Write the bundle and
stop.

## Process

1. Read the project context, feature expectation, and approved test
   cases. Pick the framework.
2. Create the directory layout described above. Use ``mkdir -p`` and
   ``str_replace_based_edit_tool create`` for files.
3. Author one test per approved case. Skip cases that cannot be
   automated and document why in README.md.
4. Write ``run.sh`` last so the test files are in place.
5. Verify the layout with ``ls -la /task/output/workspace`` once.
6. End your turn with a one-sentence plain-text summary.

Stay strictly within ``/task/output/workspace/``. Do not write
outside it.
</TASK_CONTRACT>"""


def build_agent_4_prompt(
    project_context: dict[str, Any] | None,
    feature_expectation: dict[str, Any] | None,
    workspace_findings: str | None,
    approved_test_cases: list[dict[str, Any]],
) -> str:
    """Compose the user prompt sent to the sandbox.

    All four sections are JSON-encoded except the findings, which are
    rendered verbatim (markdown).
    """
    ctx = project_context or {}
    fe = feature_expectation or {}
    findings_block = workspace_findings or "(no findings.md was captured)"

    return f"""\
You are generating a runnable test-script bundle for a QA team. Read the
sections below, pick a single test framework, and produce the bundle
under ``/task/output/workspace/`` per the strict system-prompt contract.

Move quickly — aim to finish in under 5 minutes. No screenshots.

## Project context
- Name: {ctx.get("name", "N/A")}
- Description: {ctx.get("description", "N/A")}
- Tech stack: {ctx.get("tech_stack", "N/A")}
- Target users: {ctx.get("target_users", "N/A")}
- Additional context: {ctx.get("additional_context", "N/A")}

## Feature expectation (approved)
{json.dumps(fe, indent=2)}

## Workspace findings (from prior reconnaissance)
{findings_block}

## Approved test cases
The list below contains every approved test case for this run, in JSON.
Each item carries an ``id`` (UUID) — copy it verbatim into the
``test_cases[].id`` field of ``manifest.json`` so results can be mapped
back. Generate one test per item.

{json.dumps(approved_test_cases, indent=2)}

Begin now. Produce the bundle and end with a one-sentence summary."""
