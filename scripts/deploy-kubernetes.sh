#!/usr/bin/env bash
set -euo pipefail

: "${IMSOP_IMAGE:?IMSOP_IMAGE must be an immutable image tag or digest}"

deployment="imsop-backend"
namespace="imsop"

kubectl -n "$namespace" set image "deployment/$deployment" "backend=$IMSOP_IMAGE"

if ! kubectl -n "$namespace" rollout status "deployment/$deployment" --timeout=5m; then
  echo "Deployment health check failed; rolling back to the previous ReplicaSet." >&2
  kubectl -n "$namespace" rollout undo "deployment/$deployment"
  kubectl -n "$namespace" rollout status "deployment/$deployment" --timeout=5m
  exit 1
fi
