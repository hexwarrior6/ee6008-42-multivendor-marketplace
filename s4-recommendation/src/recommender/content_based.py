"""Content similarity (text/category) for cold start and "similar to this product".

When order data is too sparse for collaborative filtering (or a user has no history),
this provides a stable fallback: TF-style term vectors over product titles + categories,
scored by a normalised dot product, plus a most-popular list. Standard library only.
"""
from __future__ import annotations

import math
import re
from typing import Dict, List, Optional, Sequence, Tuple

from .data_loader import CatalogItem


def _tokens(text: str) -> List[str]:
    text = (text or "").lower()
    # Split into latin/digit runs and single CJK characters (Chinese has no spaces).
    parts = re.findall(r"[a-z0-9]+|[\u4e00-\u9fff]", text)
    toks: List[str] = []
    for p in parts:
        toks.append(p)
    return toks


_BUILTIN_STOP = {"the", "a", "an", "and", "or", "of", "to", "in", "for"}


class ContentRecommender:
    def __init__(self) -> None:
        self.item_ids: List[str] = []
        self.doc_vec: List[Dict[str, float]] = []   # L1-normalised term vectors
        self.meta: Dict[str, CatalogItem] = {}
        self.popular: List[str] = []                # global popularity (by interaction count)

    def fit(self, catalog: Sequence[CatalogItem], freq: Optional[Dict[str, int]] = None):
        self.item_ids = [c.product_id for c in catalog]
        self.meta = {c.product_id: c for c in catalog}

        idf: Dict[str, float] = {}
        raw: Dict[int, List[str]] = {}
        for idx, c in enumerate(catalog):
            text = " ".join([c.title, c.meta.get("categories", "")])
            raw[idx] = [t for t in _tokens(text) if t not in _BUILTIN_STOP]
            for t in set(raw[idx]):
                idf[t] = idf.get(t, 0.0) + 1.0

        n = len(catalog)
        for t, cnt in idf.items():
            idf[t] = 1.0 + math.log((1.0 + n) / (1.0 + cnt))
        self.doc_vec = []
        for i in range(n):
            v: Dict[str, float] = {}
            for t in raw[i]:
                v[t] = v.get(t, 0.0) + idf.get(t, 1.0)
            # L1 normalisation: the normalised dot product approximates cosine on small
            # data without pulling in sklearn.
            mag = sum(v.values())
            if mag > 0:
                v = {k: val / mag for k, val in v.items()}
            self.doc_vec.append(v)

        # Popularity list.
        if freq:
            self.popular = sorted(freq, key=lambda pid: -freq[pid])[:200]
        return self

    def _sim(self, i: int, j: int) -> float:
        a, b = self.doc_vec[i], self.doc_vec[j]
        if not a or not b:
            return 0.0
        inter = set(a) & set(b)
        return sum(a[t] * b[t] for t in inter)

    def similar_by_pid(self, pid: str, top_n: int, exclude: set = ()) -> List[Tuple[str, float]]:
        if pid not in self.meta:
            top = self.top_n_all(top_n)
            return [(pid2, sc) for pid2, sc in top][:top_n]
        idx = self.item_ids.index(pid)
        scored = sorted(
            ((self.item_ids[j], self._sim(idx, j)) for j in range(len(self.item_ids)) if j != idx),
            key=lambda x: -x[1],
        )
        out = []
        for pid2, sc in scored:
            if pid2 in exclude:
                continue
            out.append((pid2, float(sc)))
            if len(out) >= top_n:
                break
        return out

    def top_n_all(self, top_n: int) -> List[Tuple[str, float]]:
        """Cold start: popularity first, then fill with catalogue items (deterministic)."""
        out = []
        for pid in self.popular:
            out.append((pid, 1.0 / (1 + len(out))))
            if len(out) >= top_n:
                break
        for c in self.meta.values():
            if len(out) >= top_n:
                break
            if c.product_id not in {p for p, _ in out}:
                out.append((c.product_id, 0.2))
        return out[:top_n]

    def recommend_by_seed(self, seed_pids: Sequence[str], top_n: int = 8) -> List[Tuple[str, float]]:
        """Fuse recommendations from every product a user already owns (fallback use)."""
        seed = [pid for pid in seed_pids if pid in self.meta]
        if not seed:
            return self.top_n_all(top_n)
        acc: Dict[str, float] = {}
        for pid in seed:
            for pid2, sc in self.similar_by_pid(pid, max(top_n, 10)):
                acc[pid2] = acc.get(pid2, 0.0) + max(sc, 0.0)
        bad = {pid for pid in seed}
        ranked = sorted(((pid, sc) for pid, sc in acc.items() if pid not in bad),
                        key=lambda x: -x[1])
        if not ranked:
            return self.top_n_all(top_n)
        return ranked[:top_n]
