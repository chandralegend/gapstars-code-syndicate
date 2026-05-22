# Sandbox image for claude-sandbox-svc.
#
# Extends Anthropic's Computer Use reference image with a headless entrypoint
# that reads /task/input.json, runs computer_use_demo.loop.sampling_loop, and
# writes /task/output/{result.json,error.json,trace.jsonl,screenshots/...}.
#
# We keep the upstream X11 + noVNC stack so the live view still works, but we
# do NOT start Streamlit or the upstream http_server.

FROM ghcr.io/anthropics/anthropic-quickstarts:computer-use-demo-latest

USER computeruse
WORKDIR /home/computeruse

# Headless entrypoint scripts live under /opt/runner.
# Use sudo (NOPASSWD is configured in the base image) to write outside $HOME.
USER root
RUN mkdir -p /opt/runner /task && chown -R computeruse:computeruse /opt/runner /task

COPY --chown=computeruse:computeruse headless.py /opt/runner/headless.py
COPY --chown=computeruse:computeruse entrypoint.sh /opt/runner/entrypoint.sh
RUN chmod +x /opt/runner/entrypoint.sh

USER computeruse

# /task is the bind-mount point for per-task input/output. The host service
# mounts data/tasks/{task_id}/ here.
VOLUME ["/task"]

# Ports kept from the base image:
#  5900 - VNC
#  6080 - noVNC web client (this is what we expose to the user)
#  8501 - (unused; Streamlit not started)
#  8080 - (unused; combined view not started)
EXPOSE 5900 6080

ENTRYPOINT ["/opt/runner/entrypoint.sh"]
