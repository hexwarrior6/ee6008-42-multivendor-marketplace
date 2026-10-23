#!/usr/bin/env sh
# Start the S4 recommendation REST API.
#
# Behaviour:
#   1. If artifacts/recommendations.json is missing and DATABASE_URL is configured,
#      train it once (read-only against the platform database) before serving.
#   2. Otherwise start immediately; the service degrades to empty results, never
#      crashes, so a missing artifact cannot take the storefront down.
#
# Railway injects PORT; local runs default to 8000.
set -eu

cd "$(dirname "$0")/.."   # -> recommendation-engine/

ARTIFACT="${RECOMMENDATIONS_PATH:-artifacts/recommendations.json}"

if [ ! -f "$ARTIFACT" ] && [ -n "${DATABASE_URL:-}" ]; then
  echo "[start_api] artifact '$ARTIFACT' missing; training from DATABASE_URL ..."
  mkdir -p "$(dirname "$ARTIFACT")"
  python -m recommender.train --models svd,als --export "$ARTIFACT" || \
    echo "[start_api] WARNING: training failed; the API will return empty recommendations."
fi

exec uvicorn recommender.api:app --host 0.0.0.0 --port "${PORT:-8000}"
