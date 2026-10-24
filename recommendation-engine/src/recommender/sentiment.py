"""Simple, dependency-free sentiment analysis over product reviews (Week 10).

Project requirement (EE6008 plan, Week 10 — Seller Analytics Dashboard):
    "S4 contributes a simple sentiment analysis layer over the existing product
    review data."

Design goals
------------
- **No third-party dependency** (the project's core dependency budget is numpy only).
- **Explainable**: lexicon + rules (positive/negative terms, negation flips,
  intensifiers), optionally fused with the star rating — not a black box.
- **Bilingual**: the marketplace has mixed Chinese/English review text.
- **Privacy-preserving**: the exported report contains only aggregates (counts,
  ratios, average scores, top terms). Reviewer ids and raw review text are never
  written out.
- **Read-only**: it never writes to the platform database.

Usage
-----
    python -m recommender.sentiment --inspect
    python -m recommender.sentiment --export artifacts/sentiment.json

The exported JSON is consumed by S1's analytics aggregation endpoint and rendered
by S2's seller dashboard.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import time
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from . import database
from .config import get_config

# ---------------------------------------------------------------------------
# Lexicons. Weights allow "neutral-ish" words (e.g. 一般) to count less.
# ---------------------------------------------------------------------------
POSITIVE: Dict[str, float] = {
    # English
    "good": 1.0, "great": 1.2, "excellent": 1.5, "amazing": 1.5, "awesome": 1.4,
    "love": 1.3, "loved": 1.3, "like": 0.8, "beautiful": 1.2, "pretty": 1.0,
    "perfect": 1.4, "happy": 1.1, "satisfied": 1.2, "recommend": 1.0, "worth": 1.0,
    "quality": 0.9, "nice": 1.0, "wonderful": 1.4, "fantastic": 1.5, "fast": 0.8,
    "helpful": 0.9, "sturdy": 1.1, "durable": 1.1, "comfortable": 1.0,
    # Chinese
    "好": 1.0, "很好": 1.3, "不错": 1.1, "喜欢": 1.2, "满意": 1.2, "漂亮": 1.2,
    "精致": 1.3, "值得": 1.1, "推荐": 1.0, "惊喜": 1.4, "完美": 1.5, "开心": 1.1,
    "优质": 1.2, "结实": 1.1, "耐用": 1.1, "快": 0.7, "好评": 1.3, "棒": 1.2,
    "赞": 1.1, "舒服": 1.0, "精美": 1.2, "满意": 1.2,
}

NEGATIVE: Dict[str, float] = {
    # English
    "bad": 1.2, "poor": 1.2, "terrible": 1.6, "awful": 1.6, "horrible": 1.6,
    "hate": 1.4, "dislike": 1.0, "disappointed": 1.3, "disappointing": 1.3,
    "broken": 1.4, "damaged": 1.4, "cheap": 0.9, "flimsy": 1.2, "waste": 1.4,
    "slow": 0.9, "late": 0.9, "wrong": 1.0, "defective": 1.4, "refund": 1.0,
    "ugly": 1.2, "rough": 1.0, "dirty": 1.1,
    # Chinese
    "差": 1.2, "很差": 1.5, "糟糕": 1.5, "失望": 1.4, "破损": 1.4, "损坏": 1.4,
    "粗糙": 1.2, "难用": 1.2, "后悔": 1.3, "不值": 1.2, "垃圾": 1.6, "慢": 0.8,
    "迟到": 0.9, "退货": 1.0, "缺陷": 1.3, "差评": 1.4, "难看": 1.2, "不好": 1.0,
    "一般": 0.5, "脏": 1.0, "掉色": 1.1,
}

NEGATORS = {
    "not", "no", "never", "none", "isn't", "wasn't", "don't", "didn't", "doesn't",
    "不", "没", "没有", "无", "别", "未", "不要", "不太", "并不",
}

INTENSIFIERS: Dict[str, float] = {
    "very": 1.5, "really": 1.5, "so": 1.3, "extremely": 2.0, "incredibly": 1.8,
    "太": 1.6, "很": 1.5, "非常": 1.8, "特别": 1.6, "超": 1.5, "极其": 2.0,
}

POSITIVE_THRESHOLD = 0.15
NEGATIVE_THRESHOLD = -0.15
WINDOW = 8  # characters before a term inspected for negation/intensifier


# ---------------------------------------------------------------------------
# Core analysis
# ---------------------------------------------------------------------------
@dataclass
class SentimentResult:
    label: str                      # positive | neutral | negative
    score: float                    # -1.0 .. 1.0
    positive_terms: List[str] = field(default_factory=list)
    negative_terms: List[str] = field(default_factory=list)
    rating: Optional[float] = None


def _contains(text: str, term: str) -> bool:
    """Word-boundary match for ASCII terms, substring match for CJK terms."""
    if term.isascii():
        return re.search(r"(?<![a-z])" + re.escape(term) + r"(?![a-z])", text) is not None
    return term in text


def _window_before(text: str, term: str) -> str:
    idx = text.find(term)
    if idx < 0:
        return ""
    return text[max(0, idx - WINDOW):idx]


def _is_negated(text: str, term: str) -> bool:
    window = _window_before(text, term)
    return any(neg in window for neg in NEGATORS)


def _intensity(text: str, term: str) -> float:
    window = _window_before(text, term)
    factor = 1.0
    for word, weight in INTENSIFIERS.items():
        if word.isascii():
            if re.search(r"(?<![a-z])" + re.escape(word) + r"(?![a-z])", window):
                factor = max(factor, weight)
        elif word in window:
            factor = max(factor, weight)
    return factor


def _collect(text: str, lexicon: Dict[str, float], flip_on_negation: bool):
    """Return (weighted_hits, terms) for one lexicon, applying negation/intensity."""
    hits = 0.0
    terms: List[str] = []
    for term, weight in lexicon.items():
        if not _contains(text, term):
            continue
        weighted = weight * _intensity(text, term)
        negated = _is_negated(text, term)
        if negated and flip_on_negation:
            hits -= weighted
        elif negated:
            hits += weighted
        else:
            hits += weighted
        terms.append(term)
    return hits, terms


def analyze(text: Optional[str], rating: Optional[float] = None) -> SentimentResult:
    """Score one review. Text and rating are both optional; rating can stand alone."""
    normalized = (text or "").lower()
    pos_hits, pos_terms = _collect(normalized, POSITIVE, flip_on_negation=True)
    neg_hits, neg_terms = _collect(normalized, NEGATIVE, flip_on_negation=True)

    raw = pos_hits - neg_hits
    text_score = math.tanh(raw / 2.0)

    rating_score: Optional[float] = None
    if rating is not None:
        try:
            value = float(rating)
        except (TypeError, ValueError):
            value = 0.0
        if 1.0 <= value <= 5.0:
            rating_score = (value - 3.0) / 2.0

    if rating_score is not None and (pos_terms or neg_terms):
        score = 0.6 * text_score + 0.4 * rating_score
    elif rating_score is not None:
        score = rating_score
    else:
        score = text_score

    score = max(-1.0, min(1.0, score))
    if score > POSITIVE_THRESHOLD:
        label = "positive"
    elif score < NEGATIVE_THRESHOLD:
        label = "negative"
    else:
        label = "neutral"

    return SentimentResult(
        label=label,
        score=round(score, 4),
        positive_terms=pos_terms,
        negative_terms=neg_terms,
        rating=rating,
    )


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------
def _ratio(part: int, total: int) -> float:
    return round(part / total, 4) if total else 0.0


def summarize(results: Sequence[SentimentResult]) -> Dict[str, Any]:
    """Aggregate a group of results into the dashboard-friendly summary shape."""
    total = len(results)
    if total == 0:
        return {
            "total": 0, "positive": 0, "neutral": 0, "negative": 0,
            "positive_ratio": 0.0, "negative_ratio": 0.0,
            "average_score": 0.0, "average_rating": None,
            "top_positive_terms": [], "top_negative_terms": [],
        }

    positives = sum(1 for r in results if r.label == "positive")
    negatives = sum(1 for r in results if r.label == "negative")
    neutrals = total - positives - negatives

    ratings = [r.rating for r in results if isinstance(r.rating, (int, float))]
    average_rating = round(sum(ratings) / len(ratings), 3) if ratings else None

    pos_terms: Counter = Counter()
    neg_terms: Counter = Counter()
    for r in results:
        pos_terms.update(r.positive_terms)
        neg_terms.update(r.negative_terms)

    return {
        "total": total,
        "positive": positives,
        "neutral": neutrals,
        "negative": negatives,
        "positive_ratio": _ratio(positives, total),
        "negative_ratio": _ratio(negatives, total),
        "average_score": round(sum(r.score for r in results) / total, 4),
        "average_rating": average_rating,
        "top_positive_terms": [[t, c] for t, c in pos_terms.most_common(8)],
        "top_negative_terms": [[t, c] for t, c in neg_terms.most_common(8)],
    }


def build_report(
    reviews: Iterable[Dict[str, Any]],
    generated_at: Optional[str] = None,
    product_to_store: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """Build the exported sentiment report.

    Each review dict needs ``product_id`` plus optional ``text`` and ``rating``.
    Reviewer identity must not be included by callers.

    When ``product_to_store`` is supplied (product_id -> store_id), an additional
    ``by_store`` section is produced for the vendor-facing analytics dashboard.
    """
    by_product: Dict[str, List[SentimentResult]] = {}
    by_store: Dict[str, List[SentimentResult]] = {}
    overall: List[SentimentResult] = []
    store_map = product_to_store or {}

    for review in reviews:
        result = analyze(review.get("text"), review.get("rating"))
        overall.append(result)
        product_id = str(review.get("product_id") or "").strip()
        if product_id:
            by_product.setdefault(product_id, []).append(result)
            store_id = store_map.get(product_id)
            if store_id:
                by_store.setdefault(store_id, []).append(result)

    return {
        "generated_at": generated_at or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "model_version": "sentiment-v1",
        "overall": summarize(overall),
        "by_product": {
            pid: summarize(results) for pid, results in sorted(by_product.items())
        },
        # Always present ({} when there is no store mapping) so S1 can rely on the key.
        "by_store": {
            sid: summarize(results) for sid, results in sorted(by_store.items())
        },
    }


# ---------------------------------------------------------------------------
# Database loading (read-only; PostgreSQL + SQLite through database.Driver)
# ---------------------------------------------------------------------------
REVIEW_ID_COLUMNS = ("product_id", "item_id")
REVIEW_RATING_COLUMNS = ("rating", "score", "stars")
REVIEW_TEXT_COLUMNS = ("content", "comment", "body", "text", "message", "review")
REVIEW_TITLE_COLUMNS = ("title", "subject", "headline")
REVIEW_STATUS_COLUMNS = ("status",)


def _pick(cols: Sequence[str], candidates: Sequence[str]) -> Optional[str]:
    low = {c.lower(): c for c in cols}
    for candidate in candidates:
        if candidate in low:
            return low[candidate]
    return None


def pick_review_table(info: database.SchemaInfo) -> Optional[str]:
    """Locate the product-review table by required columns + name hints."""
    best: Optional[Tuple[int, str]] = None
    for key, cols in info.tables.items():
        low = {c.lower() for c in cols}
        name = key.split(".", 1)[-1].lower()
        if not any(c in low for c in REVIEW_ID_COLUMNS):
            continue
        has_rating = any(c in low for c in REVIEW_RATING_COLUMNS)
        has_text = any(c in low for c in REVIEW_TEXT_COLUMNS)
        if not (has_rating or has_text):
            continue
        score = 0
        if name in ("review", "product_review", "reviews"):
            score += 1000
        elif "review" in name:
            score += 100
        if has_rating:
            score += 10
        if has_text:
            score += 10
        if best is None or score > best[0]:
            best = (score, key)
    return best[1] if best else None


def load_reviews(
    cfg,
    info: database.SchemaInfo,
    review_key: str,
    limit: int = 0,
) -> List[Dict[str, Any]]:
    """Read reviews as ``{product_id, text, rating}`` — aggregates only downstream."""
    cols = info.tables[review_key]
    pid_col = _pick(cols, REVIEW_ID_COLUMNS)
    rating_col = _pick(cols, REVIEW_RATING_COLUMNS)
    text_col = _pick(cols, REVIEW_TEXT_COLUMNS)
    title_col = _pick(cols, REVIEW_TITLE_COLUMNS)
    status_col = _pick(cols, REVIEW_STATUS_COLUMNS)
    if not pid_col or not (rating_col or text_col):
        raise RuntimeError(
            f"Review table {review_key} lacks product_id or text/rating columns: {cols}"
        )

    select = [f'"{pid_col}" AS product_id']
    if rating_col:
        select.append(f'"{rating_col}" AS rating')
    if text_col:
        select.append(f'"{text_col}" AS content')
    if title_col:
        select.append(f'"{title_col}" AS title')

    sql = f"SELECT {', '.join(select)} FROM {database.quote_table(review_key)}"
    params: List[Any] = []
    if status_col:
        # Skip rejected/spam reviews when the plugin exposes a status column.
        sql += f' WHERE COALESCE(CAST("{status_col}" AS TEXT), \'\') NOT IN (\'rejected\', \'spam\')'
    if limit and limit > 0:
        sql += " LIMIT %s" if not database.is_sqlite(cfg.database_url) else " LIMIT ?"
        params.append(int(limit))

    with database.Driver(cfg.database_url) as driver:
        rows = driver.query(sql, params)

    reviews: List[Dict[str, Any]] = []
    for row in rows:
        product_id = str(row.get("product_id") or "").strip()
        if not product_id:
            continue
        text_parts = [str(row.get("title") or ""), str(row.get("content") or "")]
        text = " ".join(part for part in text_parts if part).strip()
        reviews.append(
            {
                "product_id": product_id,
                "text": text,
                "rating": row.get("rating"),
            }
        )
    return reviews


def load_product_store_map(cfg, info: database.SchemaInfo) -> Dict[str, str]:
    """Map product_id -> store_id so the report can aggregate per vendor.

    Returns an empty mapping when the product table has no store/seller column, so
    ``by_store`` is simply empty rather than failing the whole run.
    """
    product_key = info.role_map.get("product")
    if not product_key:
        return {}
    cols = info.tables[product_key]
    id_col = _pick(cols, ("id",))
    store_col = _pick(cols, ("store_id", "seller_id", "vendor_id"))
    if not id_col or not store_col:
        return {}
    sql = (
        f'SELECT "{id_col}" AS product_id, "{store_col}" AS store_id '
        f"FROM {database.quote_table(product_key)}"
    )
    with database.Driver(cfg.database_url) as driver:
        rows = driver.query(sql)
    mapping: Dict[str, str] = {}
    for row in rows:
        product_id = str(row.get("product_id") or "").strip()
        store_id = str(row.get("store_id") or "").strip()
        if product_id and store_id:
            mapping[product_id] = store_id
    return mapping


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_EXPORT = PROJECT_ROOT / "artifacts" / "sentiment.json"


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=1)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Sentiment analysis over product reviews (read-only)."
    )
    parser.add_argument("--export", default=str(DEFAULT_EXPORT), help="output JSON path")
    parser.add_argument("--inspect", action="store_true", help="print review table resolution and exit")
    parser.add_argument("--limit", type=int, default=0, help="max reviews to read (0 = all)")
    args = parser.parse_args(argv)

    cfg = get_config()
    info = database.list_schema(cfg)
    database.resolve_roles(cfg, info)
    review_key = pick_review_table(info)
    if not review_key:
        print("Could not resolve a product-review table. Run --inspect and check the schema.")
        return 2
    if args.inspect:
        print(database.describe(info))
        print(f"\nreview table -> {review_key}  columns: {', '.join(info.tables[review_key])}")
        store_map = load_product_store_map(cfg, info)
        if store_map:
            print(f"product->store mapping: {len(store_map)} products (by_store enabled)")
        else:
            print("product->store mapping: unavailable "
                  "(product table has no store_id/seller_id/vendor_id; by_store will be empty)")
        return 0

    reviews = load_reviews(cfg, info, review_key, limit=args.limit)
    product_to_store = load_product_store_map(cfg, info)
    report = build_report(reviews, product_to_store=product_to_store)
    path = Path(args.export)
    _write_json(path, report)
    overall = report["overall"]
    print(f"[sentiment] reviews={overall['total']} positive={overall['positive']} "
          f"neutral={overall['neutral']} negative={overall['negative']} "
          f"avg_score={overall['average_score']}")
    print(f"[export] {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
