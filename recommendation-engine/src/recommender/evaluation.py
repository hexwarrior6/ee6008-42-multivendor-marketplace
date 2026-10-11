"""Offline evaluation: precision@K / recall@K / HitRate@K / coverage.

Feed each model's scoring function together with the held-out ground truth; already
purchased items are excluded per user, mirroring production behaviour. Standard library
only (numpy is imported lazily inside the ranking helper).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Set

from .preprocessing import CleanData


@dataclass
class MetricBundle:
    model: str = ""
    precision_at_k: float = 0.0
    recall_at_k: float = 0.0
    coverage: float = 0.0
    hit_rate: float = 0.0
    n_evaluated: int = 0

    def as_dict(self) -> dict:
        return {
            "model": self.model,
            "precision@K": round(self.precision_at_k, 4),
            "recall@K": round(self.recall_at_k, 4),
            "hit@K": round(self.hit_rate, 4),
            "coverage": round(self.coverage, 4),
            "evaluated": self.n_evaluated,
        }


def user_seen(train: CleanData) -> Dict[int, Set[int]]:
    out: Dict[int, Set[int]] = {}
    for u, i, _w in train.rows:
        out.setdefault(u, set()).add(i)
    return out


def _order_by_score(u: int, model, top_n: int) -> List[int]:
    """Rank all items for a user by score (history not filtered; evaluate trims later)."""
    import numpy as np

    s = np.asarray(model.score_user(u))
    return [int(x) for x in np.argsort(s)[::-1]][:max(top_n, 1)]


def evaluate(
    model,
    ground: Dict[str, List[str]],
    train: CleanData,
    item_ok: List[str],
    top_n: int,
) -> MetricBundle:
    """Evaluate a single model.

    ground: user_id(str) -> held-out product_id list.
    train : training CleanData (used to exclude each user's history, keeping index order).
    """
    assert len(item_ok) == train.n_items
    seen = user_seen(train)
    idx_by_user = {uid: i for i, uid in enumerate(train.user_ids)}
    item_index = {pid: i for i, pid in enumerate(train.item_ids)}

    prec_sum = recall_sum = hit = evaluated = 0.0
    covered: Set[int] = set()

    for uid_str, g_items in ground.items():
        u = idx_by_user.get(uid_str)
        if u is None:
            continue
        gset = {item_index[x] for x in g_items if x in item_index}
        if not gset:
            continue
        exclude = seen.get(u, set())
        ranked = _order_by_score(u, model, len(train.item_ids))
        rec = [i for i in ranked if i not in exclude][:top_n]
        if not rec:
            continue
        rec_pids = {train.item_ids[i] for i in rec}
        g_pids = {train.item_ids[i] for i in gset}
        hit_n = len(rec_pids & g_pids)
        prec_sum += hit_n / float(max(len(rec), 1))
        recall_sum += hit_n / float(len(g_pids)) if g_pids else 0.0
        if hit_n > 0:
            hit += 1.0
        covered.update(rec)
        evaluated += 1.0

    bundle = MetricBundle()
    if evaluated:
        bundle.precision_at_k = prec_sum / evaluated
        bundle.recall_at_k = recall_sum / evaluated
        bundle.hit_rate = hit / evaluated
        bundle.coverage = len(covered) / float(len(item_ok)) if item_ok else 0.0
        bundle.n_evaluated = int(evaluated)
    return bundle
