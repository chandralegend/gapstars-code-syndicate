#!/usr/bin/env bash
# Build the sandbox image used by the API service.
set -euo pipefail

IMAGE_TAG="${SANDBOX_IMAGE:-qa-sandbox:local}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Building $IMAGE_TAG from $ROOT/docker"
docker build -t "$IMAGE_TAG" "$ROOT/docker"
echo "Built $IMAGE_TAG"
