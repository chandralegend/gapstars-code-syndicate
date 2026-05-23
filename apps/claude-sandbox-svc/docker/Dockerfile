# Sandbox image for claude-sandbox-svc.
#
# Extends Anthropic's Computer Use reference image with two entrypoints:
#  1. Headless agent loop (kind=exploration): the original computer-use
#     loop that reads /task/input.json and writes /task/output/...
#  2. Bundle execution (kind=execution): runs /task/input/bundle/run.sh
#     and captures /task/input/bundle/reports/ into /task/output/.
#
# Which path runs is decided by the TASK_KIND env var, dispatched in
# entrypoint.sh. Defaults to "exploration" for back-compat.

FROM ghcr.io/anthropics/anthropic-quickstarts:computer-use-demo-latest

USER computeruse
WORKDIR /home/computeruse

# Test execution dependencies. We install pytest + playwright (Python
# bindings + browser drivers) so Agent 4's pytest-flavoured bundles
# can run without any extra setup at execution time.
#
# pytest-html gives us a default HTML report alongside the JUnit XML.
# pytest-playwright wires up the page fixture so generated tests can
# `def test_*(page):` straight away.
USER root
RUN pip3 install --no-cache-dir \
    "pytest>=8.0,<9" \
    "pytest-html>=4.1,<5" \
    "pytest-playwright>=0.5,<0.7" \
    "playwright>=1.45,<2"

# Install playwright's system deps as root (only needed once, can't be
# done as the unprivileged user). Then chown the browser cache dir to
# `computeruse` and run the actual browser download as that user, so
# the cache's .links/ entries are owned by the user that will read
# them at execution time. Without this, a `playwright install` from
# the bundle's run.sh hangs trying to upgrade root-owned link files.
RUN python3 -m playwright install-deps chromium && \
    mkdir -p /home/computeruse/.cache/ms-playwright && \
    chown -R computeruse:computeruse /home/computeruse/.cache

USER computeruse
RUN python3 -m playwright install chromium

USER root
RUN mkdir -p /opt/runner /task && chown -R computeruse:computeruse /opt/runner /task

COPY --chown=computeruse:computeruse headless.py /opt/runner/headless.py
COPY --chown=computeruse:computeruse run_bundle.sh /opt/runner/run_bundle.sh
COPY --chown=computeruse:computeruse entrypoint.sh /opt/runner/entrypoint.sh
RUN chmod +x /opt/runner/entrypoint.sh /opt/runner/run_bundle.sh

USER computeruse

VOLUME ["/task"]

EXPOSE 5900 6080

ENTRYPOINT ["/opt/runner/entrypoint.sh"]
