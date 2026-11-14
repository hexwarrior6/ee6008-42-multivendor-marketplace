#!/usr/bin/env sh
# Start the S4 recommendation REST API.
#
# Behaviour:
#   1. If artifacts/recommendations.json is missing and DATABASE_URL is configured,
#      train it once (read-only against the platform database) before serving.
#   2. Same for artifacts/sentiment.json (Week 10 review sentiment summary).
#   3. Otherwise start immediately; the service degrades to empty results, never
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

SENTIMENT_ARTIFACT="${SENTIMENT_PATH:-artifacts/sentiment.json}"

if [ ! -f "$SENTIMENT_ARTIFACT" ] && [ -n "${DATABASE_URL:-}" ]; then
  echo "[start_api] sentiment artifact '$SENTIMENT_ARTIFACT' missing; exporting from DATABASE_URL ..."
  mkdir -p "$(dirname "$SENTIMENT_ARTIFACT")"
  python -m recommender.sentiment --export "$SENTIMENT_ARTIFACT" || \
    echo "[start_api] WARNING: sentiment export failed; /sentiment will return dimension=unavailable."
fi

exec uvicorn recommender.api:app --host 0.0.0.0 --port "${PORT:-8000}"
