#!/bin/bash
# Headless entrypoint for the claude-sandbox-svc sandbox.
#
# Brings up the upstream X11 + noVNC stack (from the reference image's $HOME),
# then runs our headless agent runner.

set -euo pipefail

cd /home/computeruse

echo "[entrypoint] starting X11 stack"
./start_all.sh

echo "[entrypoint] starting noVNC"
./novnc_startup.sh

# Wait for the X display to be ready before the agent starts (avoid flaky
# first screenshot).
for i in $(seq 1 30); do
    if xdpyinfo -display ":${DISPLAY_NUM}" >/dev/null 2>&1; then
        break
    fi
    sleep 0.5
done

echo "[entrypoint] launching headless runner"
export PYTHONPATH="/home/computeruse:${PYTHONPATH:-}"
exec python /opt/runner/headless.py
