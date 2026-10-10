"""Export trained models + catalogue into RecommendationItem-friendly JSON.

Output shape (see README section 5):
{
  "source": "als",
  "model_version": "...",
  "generated_at": "...",
  "by_user":    { "<customer_id>": [ {product_id,title,...} ] },
  "by_product": { "<product_id>":  [ {product_id,title,...} ] },
  "fallback":   [ {product_id,...} ]
}
"""
from __future__ import annotations

import json
import time
from typing import Dict, List, Optional

import numpy as np

from .content_based import ContentRecommender
from .preprocessing import CleanData


def _rows_by_u(cd: CleanData) -> Dict[int, set]:
    out: Dict[int, set] = {}
    for u, i, _w in cd.rows:
        out.setdefault(u, set()).add(i)
    return out


def make_item(cd: CleanData, idx: int, score: float, titles=None, handles=None, thumbs=None) -> dict:
    """Build one RecommendationItem-compatible dict."""
    pid = cd.item_ids[idx]
    return {
        "product_id": pid,
        "title": (titles or {}).get(pid, ""),
        "handle": (handles or {}).get(pid),
        "thumbnail": (thumbs or {}).get(pid),
        "score": round(float(score), 6),
        "reason": None,
    }


def export_user(
    model,
    cd: CleanData,
    top_n: int = 8,
    titles=None, handles=None, thumbs=None, max_users: Optional[int] = None,
) -> Dict[str, object]:
    """Top-N recommendations per user (excluding items already in their history)."""
    seen = _rows_by_u(cd)
    if not hasattr(model, "score_user"):
        raise TypeError("model must implement score_user(u)->array to export real scores.")
    out: Dict[str, object] = {}
    for u in range(cd.n_users):
        top = (model.top_items(u, seen.get(u, set()), top_n)
               if hasattr(model, "top_items")
               else _top_by_scores(model, u, seen.get(u, set()), top_n))
        if not top:
            continue
        scores = model.score_user(u)
        out[cd.user_ids[u]] = [make_item(cd, idx, scores[idx], titles, handles, thumbs) for idx in top]
        if max_users and len(out) >= max_users:
            break
    return out


def _top_by_scores(model, u: int, exclude: set, top_n: int) -> List[int]:
    s = np.asarray(model.score_user(u))
    order = np.argsort(s)[::-1].tolist()
    picked: List[int] = []
    for idx in order:
        if idx in exclude:
            continue
        picked.append(int(idx))
        if len(picked) >= top_n:
            break
    return picked


def export_product_similar(
    content: Optional[ContentRecommender],
    cd: CleanData,
    top_n: int = 8,
    titles=None, handles=None, thumbs=None,
) -> Dict[str, object]:
    """Similar products per product (for the product-detail page)."""
    out: Dict[str, object] = {}
    if content is None:
        return out
    for pid in cd.item_ids:
        sim = content.similar_by_pid(pid, top_n)
        if sim:
            items = []
            for pid2, sc in sim:
                items.append({
                    "product_id": pid2,
                    "title": (titles or {}).get(pid2, ""),
                    "handle": (handles or {}).get(pid2),
                    "thumbnail": (thumbs or {}).get(pid2),
                    "score": round(float(sc), 6),
                })
            out[pid] = items
    return out


def export_fallback(content: Optional[ContentRecommender], top_n: int = 8,
                    titles=None, handles=None, thumbs=None) -> list:
    """Anonymous / cold-start fallback (popularity + content)."""
    if content is None:
        return []
    items = []
    for pid, sc in content.top_n_all(top_n):
        items.append({
            "product_id": pid,
            "title": (titles or {}).get(pid, ""),
            "handle": (handles or {}).get(pid),
            "thumbnail": (thumbs or {}).get(pid),
            "score": round(float(sc), 6),
        })
    return items


def dump(path: str, payload: dict, model_name: str, version: str = "reco-v1") -> None:
    payload = dict(payload)
    payload.setdefault("source", model_name)
    payload.setdefault("model_version", version)
    payload.setdefault("generated_at", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1)


def load(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)
