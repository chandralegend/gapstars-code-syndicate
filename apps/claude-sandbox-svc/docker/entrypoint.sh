#!/bin/bash
# Headless entrypoint for the claude-sandbox-svc sandbox.
#
# Dispatches on $TASK_KIND:
#   exploration (default) - original Anthropic computer-use loop, used
#                           by Agents 2 and 4 to drive a browser.
#   execution             - run a generated test-script bundle and
#                           capture its reports/.
#
# Both paths bring up the X11 + noVNC stack so the live view works.

set -euo pipefail

cd /home/computeruse

echo "[entrypoint] starting X11 stack"
./start_all.sh

echo "[entrypoint] starting noVNC"
./novnc_startup.sh

# Wait for the X display to be ready before we hand off (avoid flaky
# first screenshot for exploration; avoid headed-browser launch races
# for execution).
for i in $(seq 1 30); do
    if xdpyinfo -display ":${DISPLAY_NUM}" >/dev/null 2>&1; then
        break
    fi
    sleep 0.5
done

KIND="${TASK_KIND:-exploration}"

case "$KIND" in
    exploration)
        echo "[entrypoint] launching headless runner (exploration)"
        export PYTHONPATH="/home/computeruse:${PYTHONPATH:-}"
        exec python /opt/runner/headless.py
        ;;
    execution)
        echo "[entrypoint] launching bundle execution"
        exec /opt/runner/run_bundle.sh
        ;;
    *)
        echo "[entrypoint] unknown TASK_KIND=$KIND" >&2
        exit 64
        ;;
esac
