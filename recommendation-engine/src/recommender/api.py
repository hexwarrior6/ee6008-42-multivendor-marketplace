"""

Serves the offline artifact produced by::

    python -m recommender.train --export artifacts/recommendations.json

Endpoints
---------
``GET /health``
``GET /recommendations?customer_id=&product_id=&limit=``
``GET /sentiment?product_id=&store_id=``

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
import secrets
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:  # optional dependency group: [api]
    from fastapi import Depends, FastAPI, HTTPException, Query, Response, Security
    from fastapi.security import APIKeyHeader
except ImportError as exc:  # pragma: no cover - only when extras are missing
    raise ImportError(
        "The recommendation API requires optional dependencies.\n"
        "Install them with:  pip install -e \".[api]\"\n"
        "or:                 pip install fastapi \"uvicorn[standard]\""
    ) from exc

# .../recommendation-engine/src/recommender/api.py -> recommendation-engine/
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ARTIFACT = PROJECT_ROOT / "artifacts" / "recommendations.json"
DEFAULT_SENTIMENT_ARTIFACT = PROJECT_ROOT / "artifacts" / "sentiment.json"

ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{1,128}$")
MAX_LIMIT = 24

# Tiny caches so repeated requests do not re-read the JSON. They are refreshed when the
# file's mtime changes, so a cron-trained artifact is picked up without a restart.
_cache: Dict[str, Any] = {"path": None, "mtime": None, "data": None}
_sentiment_cache: Dict[str, Any] = {"path": None, "mtime": None, "data": None}

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def require_api_key(api_key: Optional[str] = Security(_api_key_header)) -> None:
    """Authenticate trusted backend callers; missing configuration fails closed."""
    expected = os.environ.get("RECOMMENDATIONS_API_KEY", "")
    headers = {"Cache-Control": "private, no-store"}
    if not expected.strip():
        raise HTTPException(
            status_code=503, detail="Recommendation API key is not configured", headers=headers
        )
    if api_key is None or not secrets.compare_digest(
        api_key.encode("utf-8"), expected.encode("utf-8")
    ):
        raise HTTPException(status_code=401, detail="Invalid API key", headers=headers)


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


# ---------------------------------------------------------------------------
# Sentiment artifact (Week 10): aggregate review sentiment for the dashboard
# ---------------------------------------------------------------------------
def sentiment_artifact_path() -> Path:
    """Sentiment report location; override with ``SENTIMENT_PATH``."""
    raw = os.environ.get("SENTIMENT_PATH")
    return Path(raw) if raw else DEFAULT_SENTIMENT_ARTIFACT


def _empty_sentiment() -> Dict[str, Any]:
    return {
        "overall": None,
        "by_product": {},
        "by_store": {},
        "model_version": None,
        "generated_at": None,
        "source": "unavailable",
    }


def load_sentiment_artifact() -> Dict[str, Any]:
    """Load (and cache) the sentiment report; degrade gracefully if absent."""
    path = sentiment_artifact_path()
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return _empty_sentiment()

    if (
        _sentiment_cache["path"] == str(path)
        and _sentiment_cache["mtime"] == mtime
        and isinstance(_sentiment_cache["data"], dict)
    ):
        return _sentiment_cache["data"]

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return _empty_sentiment()
    if not isinstance(data, dict):
        return _empty_sentiment()

    data.setdefault("overall", None)
    data.setdefault("by_product", {})
    data.setdefault("by_store", {})
    if not isinstance(data["by_product"], dict):
        data["by_product"] = {}
    if not isinstance(data["by_store"], dict):
        data["by_store"] = {}

    _sentiment_cache.update({"path": str(path), "mtime": mtime, "data": data})
    return data


def select_sentiment(
    artifact: Dict[str, Any],
    product_id: Optional[str],
    store_id: Optional[str],
) -> Tuple[Optional[Dict[str, Any]], str]:
    """Priority: ``by_product`` -> ``by_store`` -> ``overall``.

    Returns ``(summary, dimension)`` where dimension is ``product`` / ``store`` /
    ``overall`` / ``unavailable``.
    """
    by_product = artifact.get("by_product") or {}
    by_store = artifact.get("by_store") or {}
    if not isinstance(by_product, dict):
        by_product = {}
    if not isinstance(by_store, dict):
        by_store = {}

    if product_id:
        summary = by_product.get(product_id)
        if isinstance(summary, dict):
            return summary, "product"

    if store_id:
        summary = by_store.get(store_id)
        if isinstance(summary, dict):
            return summary, "store"

    overall = artifact.get("overall")
    if isinstance(overall, dict):
        return overall, "overall"
    return None, "unavailable"


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


@app.get("/recommendations", dependencies=[Depends(require_api_key)])
def recommendations(
    response: Response,
    customer_id: Optional[str] = Query(None),
    product_id: Optional[str] = Query(None),
    limit: int = Query(8, ge=1, le=MAX_LIMIT),
) -> Dict[str, Any]:
    """Return recommendations to a trusted backend that authenticates its customer."""
    response.headers["Cache-Control"] = "private, no-store"
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


@app.get("/sentiment", dependencies=[Depends(require_api_key)])
def sentiment_summary(
    response: Response,
    product_id: Optional[str] = Query(None),
    store_id: Optional[str] = Query(None),
) -> Dict[str, Any]:
    """Aggregate review sentiment for a product, a store, or the whole platform."""
    response.headers["Cache-Control"] = "private, no-store"
    for name, value in (("product_id", product_id), ("store_id", store_id)):
        if value is not None and not ID_PATTERN.match(value):
            raise HTTPException(status_code=422, detail=f"Invalid {name}")

    data = load_sentiment_artifact()
    summary, dimension = select_sentiment(data, product_id, store_id)

    context: Dict[str, str] = {}
    if product_id:
        context["product_id"] = product_id
    if store_id:
        context["store_id"] = store_id

    return {
        "summary": summary,
        "dimension": dimension,
        "context": context,
        "model_version": data.get("model_version"),
        "generated_at": data.get("generated_at"),
        "source": data.get("source", "unavailable"),
    }


def main() -> int:
    """``python -m recommender.api`` launcher; Railway injects ``PORT``."""
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
