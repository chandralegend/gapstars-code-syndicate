#!/bin/bash
# Bundle execution entrypoint.
#
# Layout assumptions (kept in lockstep with apps/api script_generation
# prompt and the sandbox-svc bundle-copy step):
#
#   /task/input/bundle/run.sh        - bundle entrypoint (must exist)
#   /task/input/bundle/manifest.json - bundle metadata (read-only here)
#   /task/input/bundle/tests/        - test files
#   /task/input/bundle/reports/      - reports/ (we ensure exists)
#
# Output:
#   /task/output/reports/            - copy of bundle reports/ for read-back
#   /task/output/result.json         - parsed summary for the api worker
#   /task/output/error.json          - on infra failure only
#
# Exit code is always 0 when run.sh actually executed. The api worker
# distinguishes pass / fail via reports/summary.json. Non-zero exit means
# the harness itself broke (missing bundle, etc.).

set -uo pipefail

BUNDLE_DIR="/task/input/bundle"
OUT_DIR="/task/output"
mkdir -p "$OUT_DIR"

write_error() {
    local msg="$1"
    python3 - <<PY > "$OUT_DIR/error.json"
import json
print(json.dumps({"message": ${msg@Q}}))
PY
    echo "[run_bundle] error: $msg" >&2
}

if [ ! -f "$BUNDLE_DIR/run.sh" ]; then
    write_error "bundle has no run.sh at $BUNDLE_DIR/run.sh"
    exit 65
fi

cd "$BUNDLE_DIR"
chmod +x run.sh || true

mkdir -p reports
SECONDS=0

echo "[run_bundle] executing bundle/run.sh"
# Stream stdout/stderr to both the container log and a captured file
# so a UI tail or post-mortem inspection both work.
bash run.sh 2>&1 | tee "$OUT_DIR/run_bundle.log"
RUN_EXIT=${PIPESTATUS[0]}
DURATION_MS=$((SECONDS * 1000))

echo "[run_bundle] run.sh exited with $RUN_EXIT after ${SECONDS}s"

# Always lift reports/ out, even on failure - half-finished JUnit can
# still be useful.
if [ -d reports ]; then
    cp -r reports "$OUT_DIR/reports"
fi

export RUN_EXIT DURATION_MS

# Build result.json. If the bundle wrote reports/summary.json we trust
# it; otherwise we synthesise a minimal record from the JUnit XML.
python3 - <<'PY' > "$OUT_DIR/result.json"
import json, os, sys
from pathlib import Path

bundle = Path("/task/input/bundle")
out = Path("/task/output")
summary = None

# Prefer the bundle-emitted summary.
sj = bundle / "reports" / "summary.json"
if sj.exists():
    try:
        summary = json.loads(sj.read_text())
    except Exception as e:
        print(f"[run_bundle] could not parse summary.json: {e}", file=sys.stderr)

# Fall back to parsing JUnit XML.
if summary is None:
    junit = bundle / "reports" / "junit.xml"
    if junit.exists():
        import xml.etree.ElementTree as ET
        try:
            root = ET.parse(junit).getroot()
            # Either <testsuites> wrapper or a single <testsuite>.
            suites = root.findall("testsuite") if root.tag == "testsuites" else [root]
            total = sum(int(s.get("tests", 0)) for s in suites)
            failed = sum(int(s.get("failures", 0)) for s in suites)
            errored = sum(int(s.get("errors", 0)) for s in suites)
            skipped = sum(int(s.get("skipped", 0)) for s in suites)
            passed = total - failed - errored - skipped
            summary = {
                "total": total,
                "passed": passed,
                "failed": failed,
                "skipped": skipped,
                "errored": errored,
            }
        except Exception as e:
            print(f"[run_bundle] junit parse failed: {e}", file=sys.stderr)

if summary is None:
    summary = {"total": 0, "passed": 0, "failed": 0, "skipped": 0, "errored": 0}

result = {
    "kind": "execution",
    "exit_code": int(os.environ.get("RUN_EXIT", "0")),
    "duration_ms": int(os.environ.get("DURATION_MS", "0")),
    "summary": summary,
}
print(json.dumps(result, indent=2))
PY

# We exit 0 because the *harness* succeeded; per-test outcome lives
# in result.json so the api worker can decide passed vs failed.
exit 0
