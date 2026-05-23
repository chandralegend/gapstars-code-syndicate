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
produce a runnable test bundle that exercises the approved test cases
provided below.

## Single-entrypoint contract — STRICT

Every bundle you produce MUST follow this layout under
``/task/output/workspace/``:

  - ``run.sh``         POSIX shell. Runs the chosen test framework.
                       Top of file: ``set -euo pipefail``. Installs
                       any missing dependencies inline (using pip3).
                       Writes a JUnit XML report to
                       ``reports/junit.xml`` and a JSON summary to
                       ``reports/summary.json`` with this exact shape::
                         { "framework": "...", "total": N, "passed": N,
                           "failed": N, "skipped": N, "errored": N,
                           "duration_s": N, "exit_code": N }
                       Exits with 0 always (the harness reads the
                       summary to decide pass/fail).
  - ``manifest.json``  Machine-readable description (schema below).
  - ``README.md``      Short human-readable description + how to run.
  - ``tests/``         Test files. See rules below.
  - ``reports/``       Directory with a single ``.gitkeep`` initially.
                       run.sh populates it at run-time.

The caller will only ever invoke ``bash run.sh``. Exactly ONE entrypoint.

## Framework choice

Pick pytest with Playwright for any test that touches a browser UI.
Use plain pytest (no browser) for pure API/logic tests.
Default: pytest + playwright.

The execution container already has these packages installed:
  - pytest, pytest-html, pytest-playwright, playwright (chromium)
Do NOT re-install them. You MAY install extra packages (e.g. requests).

## pytest rules — READ CAREFULLY

### 1. No relative imports

Every test file MUST use only absolute imports or top-level names.
NEVER write ``from .conftest import ...`` or any other relative import.
Python's test runner will fail with ImportError if you do this.

WRONG:  from .conftest import my_helper
RIGHT:  # define helpers as pytest fixtures in conftest.py instead

### 2. No manual browser/page fixtures

pytest-playwright provides ``page``, ``browser``, ``context`` fixtures
automatically. Do NOT re-define ``browser``, ``context``, or ``page``
in conftest.py. Just use ``def test_foo(page):`` directly.

### 3. conftest.py — screenshot on failure

ALWAYS create ``tests/conftest.py`` containing exactly this hook and
nothing else (add project-specific fixtures below it):

```python
import pytest

@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    rep = outcome.get_result()
    if rep.when == "call" and rep.failed:
        page = item.funcargs.get("page")
        if page is not None:
            import pathlib, re
            safe = re.sub(r"[^\\w.-]", "_", item.nodeid)
            path = pathlib.Path("reports/screenshots") / f"{safe}.png"
            path.parent.mkdir(parents=True, exist_ok=True)
            try:
                page.screenshot(path=str(path))
            except Exception:
                pass
```

This hook captures a screenshot for every failing browser test and
saves it as ``reports/screenshots/<nodeid>.png``. The runner will
expose these screenshots in the results UI.

### 4. No __init__.py files

Do NOT create ``tests/__init__.py``. Pytest's rootdir discovery works
better without it for flat test directories.

### 5. run.sh pytest invocation

Call pytest with these flags (copy verbatim, adjust paths only):

```bash
set +e
python3 -m pytest tests/ \
  --junitxml=reports/junit.xml \
  --html=reports/report.html --self-contained-html \
  -v \
  --tb=short \
  --maxfail=0 \
  -p no:cacheprovider
PYTEST_EXIT=$?
set -e
```

Then generate ``reports/summary.json`` from the JUnit XML using a short
inline Python script, then ``exit 0``.

## manifest.json schema

  {
    "schema_version": 1,
    "framework": "pytest" | "playwright" | "vitest" | ...,
    "language": "python" | "node" | "typescript" | ...,
    "entrypoint": "./run.sh",
    "test_count": <int>,
    "test_cases": [
      {
        "id": "<input test-case UUID — copy verbatim>",
        "title": "<copied from input>",
        "test_path": "tests/foo.py::test_bar"
      }
    ],
    "runtime": { "python": "3.11" }
  }

``test_cases[].id`` MUST equal the input UUID exactly.

## Forbidden

- Relative imports in any test file.
- Re-defining ``browser``, ``context``, or ``page`` fixtures.
- ``tests/__init__.py``.
- Tests that depend on internet access unless the case explicitly
  requires it.
- Multiple entrypoints.
- Documentation-only output — test code is required.

## Process

1. Read project context, feature expectation, and approved test cases.
2. Create ``tests/conftest.py`` with the screenshot hook first.
3. Author one test function per approved case. Each function name must
   contain the short test-case title (snake_cased) so failures are
   easy to identify.
4. Write ``run.sh`` last — use the exact pytest invocation above.
5. Write ``manifest.json`` and ``README.md``.
6. Run ``ls -la /task/output/workspace/tests/`` to verify no
   ``__init__.py`` crept in and all test files are present.
7. End your turn with a one-sentence plain-text summary.

Stay strictly within ``/task/output/workspace/``. Do not write
outside it.
</TASK_CONTRACT>"""


def build_agent_4_prompt(
    project_context: dict[str, Any] | None,
    feature_expectation: dict[str, Any] | None,
    workspace_findings: str | None,
    approved_test_cases: list[dict[str, Any]],
) -> str:
    """Compose the user prompt sent to the sandbox."""
    ctx = project_context or {}
    fe = feature_expectation or {}
    findings_block = workspace_findings or "(no findings.md was captured)"

    return f"""\
You are generating a runnable test-script bundle for a QA team. Read the
sections below, pick a single test framework, and produce the bundle
under ``/task/output/workspace/`` per the strict system-prompt contract.

Move quickly — aim to finish in under 5 minutes. No screenshots of your
own work; the conftest hook handles test-failure screenshots.

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
Each item carries an ``id`` (UUID) — copy it verbatim into
``manifest.json`` ``test_cases[].id``. Generate one test per item.

{json.dumps(approved_test_cases, indent=2)}

Begin now. Produce the bundle and end with a one-sentence summary."""
