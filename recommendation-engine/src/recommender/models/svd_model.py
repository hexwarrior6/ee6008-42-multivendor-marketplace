"""Collaborative filtering via a dense numpy SVD (baseline to compare against ALS).

Approach (teaching / baseline):
  1) Build a dense implicit-feedback matrix R[user x item] from the training triples
     (missing entries filled with 0; optional per-user mean centring mitigates the
     "unobserved = 0" bias).
  2) Truncated factorisation R ~ U * S * V^T with numpy.linalg.svd,
     rank = min(n_users, n_items) (naturally lower when data is small).
  3) score(u) = user embedding . item embedding (+ optional mean), used for Top-N.
Requires numpy only.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Sequence, Tuple

import numpy as np


@dataclass
class SVDPredictor:
    n_factors: int = 32
    user_mean: bool = False  # centre each user's row by its mean first
    alpha: float = 1.0       # weight exponent (>1 amplifies strong positives, 0..1 compresses)

    # Fitted artefacts.
    _user_factor: np.ndarray = None   # (n_users, d)
    _item_factor: np.ndarray = None   # (n_items, d)
    _user_mean_vec: np.ndarray = None  # (n_users,)

    def fit(self, rows: Sequence[Tuple[int, int, float]], n_users: int, n_items: int):
        if not rows:
            raise ValueError("Empty training interactions: cannot factorise. Use content/popular cold start.")
        if n_users < 1 or n_items < 1:
            raise ValueError("n_users/n_items must be >= 1")

        R = np.zeros((n_users, n_items), dtype=float)
        for u, i, w in rows:
            w = float(w)
            if w > 0:
                R[u, i] += w ** float(self.alpha)

        userm = None
        if self.user_mean:
            nz = np.maximum(R.astype(bool).sum(1), 1)
            userm = (R.sum(1) / nz)
            R = R - userm[:, None]

        # Economy SVD: returns rank = min(m, n).
        U, S, Vt = np.linalg.svd(R, full_matrices=False)
        rank = int(np.minimum(n_users, n_items))
        d = max(1, min(int(self.n_factors), rank))
        # Keep at least one dimension; U/S/Vt always have >= min dimension.
        uf = np.ascontiguousarray(U[:, :d] * S[:d][None, :])   # (n_users, d)
        itf = np.ascontiguousarray(Vt[:d, :].T)                 # (n_items, d)
        if userm is not None:
            self._user_mean_vec = userm
        else:
            self._user_mean_vec = np.zeros(n_users)
        self._user_factor = uf
        self._item_factor = itf
        return self

    def score_user(self, u: int) -> np.ndarray:
        if self._user_factor is None:
            raise RuntimeError("Model is not fitted.")
        s = self._user_factor[u] @ self._item_factor.T
        if self.user_mean:
            s = s + self._user_mean_vec[u]
        return s

    def top_items(self, u: int, exclude: set, top_n: int) -> List[int]:
        scores = self.score_user(u)
        order = np.argsort(scores)[::-1].tolist()
        out: List[int] = []
        for idx in order:
            if idx in exclude:
                continue
            out.append(int(idx))
            if len(out) >= top_n:
                break
        return out[:top_n]

    @staticmethod
    def name() -> str:
        return "svd"
