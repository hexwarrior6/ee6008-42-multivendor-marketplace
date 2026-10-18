# Week 9 deliverable: deploy the recommendation model as a REST API service.
# Works on Railway (or any container host).
#
#   docker build -t recommendation-api .
#   docker run -p 8000:8000 -e DATABASE_URL=... recommendation-api
#
# Notes:
# - The trained artifact (artifacts/recommendations.json) is intentionally NOT baked
#   into the image: it is produced by training (CI artifact or first boot) so the
#   image stays small and never serves stale recommendations silently.
# - scripts/start_api.sh trains once if the artifact is missing and DATABASE_URL is
#   set; otherwise the service starts and returns empty results (never crashes).
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

# Install API dependencies and the driver used for first-boot PostgreSQL training.
COPY pyproject.toml requirements.txt README.md ./
COPY src ./src
RUN pip install --upgrade pip && pip install -e ".[api,postgres]"

# Normalise CRLF (the repo is developed on Windows) so the shebang works in Linux.
COPY scripts/start_api.sh ./scripts/start_api.sh
RUN sed -i 's/\r$//' ./scripts/start_api.sh && chmod +x ./scripts/start_api.sh

EXPOSE 8000
CMD ["./scripts/start_api.sh"]
