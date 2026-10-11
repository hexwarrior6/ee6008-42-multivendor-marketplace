"""Data cleaning: turn raw interactions into model input (matrix views) + train/test split.

Standard library only. Project-specific rules:
  - drop interactions with empty customer/product ids,
  - drop products that are not in the catalogue,
  - drop non-positive / non-finite weights,
  - aggregate duplicate (customer, product) pairs by summing weights
    (repeat purchases = a stronger positive signal),
  - map users/items to compact indices ``0..N-1`` for the matrix models.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Dict, List, Sequence, Tuple

from .data_loader import CatalogItem, Interaction


@dataclass
class CleanData:
    """Unified container for the training/validation views.

    ``user_ids`` / ``item_ids`` keep the original identifiers in index order;
    ``rows`` holds ``(user_index, item_index, weight)`` triples.
    """

    user_ids: List[str] = field(default_factory=list)
    item_ids: List[str] = field(default_factory=list)
    rows: List[Tuple[int, int, float]] = field(default_factory=list)

    # Cached set of active user indices (cheap convenience).
    _u_set: set = field(default_factory=set, repr=False)

    def __post_init__(self) -> None:
        self._u_set = {u for u, _i, _w in self.rows}

    @property
    def n_users(self) -> int:
        return len(self.user_ids)

    @property
    def n_items(self) -> int:
        return len(self.item_ids)

    @property
    def non_zero(self) -> int:
        return len(self.rows)


def clean_interactions(
    interactions: Sequence[Interaction],
    catalog: Sequence[CatalogItem],
    min_unit_weight: float = 0.001,
) -> CleanData:
    """Aggregate raw interactions into (user, item, strength) triples with compact indices."""
    valid_items = {c.product_id for c in catalog}
    weight: Dict[Tuple[str, str], float] = {}
    freq: Dict[Tuple[str, str], int] = {}

    for it in interactions:
        cid = (it.customer_id or "").strip()
        pid = (it.product_id or "").strip()
        if not cid or not pid:
            continue
        if valid_items and pid not in valid_items:
            continue
        w = float(it.weight) if it.weight is not None else 1.0
        if not math.isfinite(w) or w <= 0:
            continue
        key = (cid, pid)
        weight[key] = weight.get(key, 0.0) + w
        freq[key] = freq.get(key, 0) + 1

    user_ids: List[str] = []
    item_ids: List[str] = []
    u_map: Dict[str, int] = {}
    i_map: Dict[str, int] = {}

    def uid(x: str) -> int:
        if x not in u_map:
            u_map[x] = len(user_ids)
            user_ids.append(x)
        return u_map[x]

    def iid(x: str) -> int:
        if x not in i_map:
            i_map[x] = len(item_ids)
            item_ids.append(x)
        return i_map[x]

    rows: List[Tuple[int, int, float]] = []
    # Place the most frequent pairs first (purely cosmetic; the result is identical).
    for key in sorted(weight, key=lambda k: (-freq[k], k[0], k[1])):
        w = weight[key]
        if w < min_unit_weight:
            continue
        rows.append((uid(key[0]), iid(key[1]), w))
    return CleanData(user_ids=user_ids, item_ids=item_ids, rows=rows)


def train_test_split(
    cd: CleanData,
    holdout_per_user: int = 1,
    seed: int = 0,
) -> Tuple[CleanData, Dict[str, List[str]], CleanData]:
    """Leave-out split: hold back up to ``holdout_per_user`` purchases per active user.

    Returns:
      train_cd : training rows (hold-out samples removed)
      ground   : str(user_id) -> [held-out product_id]
      test_cd  : same dimensions as train, containing only the held-out rows

    Users with <= holdout purchases are not held out, so every evaluated user still has
    at least one training interaction.
    """
    rng = random.Random(seed)
    by_user: Dict[int, List[int]] = {}
    for idx, (u, _i, _w) in enumerate(cd.rows):
        by_user.setdefault(u, []).append(idx)

    hold_key = set()  # row indices moved to the evaluation set
    ground: Dict[str, List[str]] = {}
    for u in sorted(by_user):
        idxs = by_user[u]
        if len(idxs) <= holdout_per_user:
            continue
        chosen = set(rng.sample(idxs, holdout_per_user))
        hold_key |= chosen
        for idx in chosen:
            _u, i, _w = cd.rows[idx]
            ground.setdefault(cd.user_ids[_u], []).append(cd.item_ids[i])

    train_rows = [cd.rows[idx] for idx in range(len(cd.rows)) if idx not in hold_key]
    test_rows = [cd.rows[idx] for idx in sorted(hold_key)]
    train_cd = CleanData(user_ids=list(cd.user_ids), item_ids=list(cd.item_ids), rows=train_rows)
    test_cd = CleanData(user_ids=list(cd.user_ids), item_ids=list(cd.item_ids), rows=test_rows)
    return train_cd, ground, test_cd


def describe(cd: CleanData) -> str:
    return (f"CleanData: users={cd.n_users}, items={cd.n_items}, "
            f"non-zero={(cd.non_zero)}")
