"""

Serves the offline artifact produced by::

    python -m recommender.train --export artifacts/recommendations.json

Endpoints
---------
``GET /health``
``GET /recommendations?customer_id=&product_id=&limit=``

Response fields mirror the backend's ``GET /store/recommendations`` contract so S1 can
forward them without reshaping. The service is strictly read-only: it never writes to
the platform database.

Optional dependencies: ``fastapi`` and ``uvicorn`` (``pip install -e ".[api]"``).
When they are missing, importing this module raises a clear ImportError.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:  # optional dependency group: [api]
    from fastapi import FastAPI, HTTPException, Query
except ImportError as exc:  # pragma: no cover - only when extras are missing
    raise ImportError(
        "The recommendation API requires optional dependencies.\n"
        "Install them with:  pip install -e \".[api]\"\n"
        "or:                 pip install fastapi \"uvicorn[standard]\""
    ) from exc

# .../recommendation-engine/src/recommender/api.py -> recommendation-engine/
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ARTIFACT = PROJECT_ROOT / "artifacts" / "recommendations.json"

ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{1,128}$")
MAX_LIMIT = 24

# Tiny cache so repeated requests do not re-read the JSON. It is refreshed when the
# file's mtime changes, so a cron-trained artifact is picked up without a restart.
_cache: Dict[str, Any] = {"path": None, "mtime": None, "data": None}


def artifact_path() -> Path:
    """Artifact location; override with ``RECOMMENDATIONS_PATH`` (e.g. on Railway)."""
    raw = os.environ.get("RECOMMENDATIONS_PATH")
    return Path(raw) if raw else DEFAULT_ARTIFACT


def _empty_artifact() -> Dict[str, Any]:
    return {
        "by_user": {},
        "by_product": {},
        "fallback": [],
        "source": "unavailable",
        "model_version": None,
        "generated_at": None,
    }


def load_artifact() -> Dict[str, Any]:
    """Load (and cache) the recommendation artifact; degrade gracefully if absent."""
    path = artifact_path()
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return _empty_artifact()

    if (
        _cache["path"] == str(path)
        and _cache["mtime"] == mtime
        and isinstance(_cache["data"], dict)
    ):
        return _cache["data"]

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return _empty_artifact()
    if not isinstance(data, dict):
        return _empty_artifact()

    data.setdefault("by_user", {})
    data.setdefault("by_product", {})
    data.setdefault("fallback", [])
    if not isinstance(data["by_user"], dict):
        data["by_user"] = {}
    if not isinstance(data["by_product"], dict):
        data["by_product"] = {}
    if not isinstance(data["fallback"], list):
        data["fallback"] = []

    _cache.update({"path": str(path), "mtime": mtime, "data": data})
    return data


def _clean_text(value: Any) -> Optional[str]:
    """Normalise ``'None'``/``''`` placeholders (some exports stringify None) to null."""
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in {"none", "null"}:
        return None
    return text


def _as_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _clean_item(raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    product_id = _clean_text(raw.get("product_id"))
    if not product_id:
        return None
    item: Dict[str, Any] = {
        "product_id": product_id,
        "title": raw.get("title") or "",
        "handle": _clean_text(raw.get("handle")),
        "thumbnail": _clean_text(raw.get("thumbnail")),
        "score": _as_float(raw.get("score")),
    }
    reason = raw.get("reason")
    if isinstance(reason, str) and reason:
        item["reason"] = reason
    return item


def select_items(
    artifact: Dict[str, Any],
    customer_id: Optional[str],
    product_id: Optional[str],
    limit: int,
) -> Tuple[List[Dict[str, Any]], str]:
    """Apply the documented priority: ``by_user`` -> ``by_product`` -> ``fallback``.

    Returns ``(items, strategy)`` where ``strategy`` is one of ``by_user`` /
    ``by_product`` / ``fallback`` / ``empty``.
    """
    by_user = artifact.get("by_user") or {}
    by_product = artifact.get("by_product") or {}
    fallback = artifact.get("fallback") or []
    if not isinstance(by_user, dict):
        by_user = {}
    if not isinstance(by_product, dict):
        by_product = {}
    if not isinstance(fallback, list):
        fallback = []

    candidates: List[Tuple[str, Any]] = []
    if customer_id:
        candidates.append(("by_user", by_user.get(customer_id)))
    if product_id:
        candidates.append(("by_product", by_product.get(product_id)))
    candidates.append(("fallback", fallback))

    for strategy, raw_items in candidates:
        if not raw_items:
            continue
        seen = set()
        cleaned: List[Dict[str, Any]] = []
        for raw in raw_items:
            if not isinstance(raw, dict):
                continue
            item = _clean_item(raw)
            if item is None:
                continue
            # Never recommend the product the visitor is currently viewing.
            if product_id and item["product_id"] == product_id:
                continue
            if item["product_id"] in seen:
                continue
            seen.add(item["product_id"])
            cleaned.append(item)
            if len(cleaned) >= limit:
                break
        if cleaned:
            return cleaned, strategy
    return [], "empty"


app = FastAPI(
    title="S4 Recommendation API",
    version="1.0.0",
    description="Read-only recommendations served from the offline training artifact.",
)


@app.get("/health")
def health() -> Dict[str, Any]:
    """Liveness + artifact status (useful for Railway health checks)."""
    data = load_artifact()
    return {
        "status": "ok",
        "source": data.get("source", "unavailable"),
        "model_version": data.get("model_version"),
        "generated_at": data.get("generated_at"),
        "by_user": len(data.get("by_user") or {}),
        "by_product": len(data.get("by_product") or {}),
        "fallback": len(data.get("fallback") or []),
    }


@app.get("/recommendations")
def recommendations(
    customer_id: Optional[str] = Query(None),
    product_id: Optional[str] = Query(None),
    limit: int = Query(8, ge=1, le=MAX_LIMIT),
) -> Dict[str, Any]:
    """Return ``RecommendationItem``-shaped items for a customer and/or product."""
    for name, value in (("customer_id", customer_id), ("product_id", product_id)):
        if value is not None and not ID_PATTERN.match(value):
            raise HTTPException(status_code=422, detail=f"Invalid {name}")

    data = load_artifact()
    items, strategy = select_items(data, customer_id, product_id, limit)

    context: Dict[str, str] = {}
    if customer_id:
        context["customer_id"] = customer_id
    if product_id:
        context["product_id"] = product_id

    return {
        "recommendations": items,
        "count": len(items),
        "limit": limit,
        "source": data.get("source", "unavailable"),
        "model_version": data.get("model_version"),
        "generated_at": data.get("generated_at"),
        "strategy": strategy,
        "personalized": strategy == "by_user",
        "context": context,
    }


def main() -> int:
    """``python -m recommender.api`` launcher; Railway injects ``PORT``."""
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
