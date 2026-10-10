"""Confidence-weighted implicit-feedback ALS (Hu, Koren & Volinsky, 2008).

Every (user, item) pair has a confidence: observed pairs get conf = 1 + alpha*weight,
unobserved pairs only contribute the default conf = 1 (carried by Y^T Y). This suits the
"purchase = positive, almost everything else = 0" pattern far better than a naive dense
SVD; both are trained side by side and compared during evaluation. Requires numpy.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Sequence, Tuple

import numpy as np


@dataclass
class ALSPredictor:
    n_factors: int = 32
    alpha_conf: float = 40.0   # observed confidence = 1 + alpha_conf * weight
    lambda_reg: float = 1e-2
    iters: int = 12
    seed: int = 0

    pos_user: Dict[int, List[Tuple[int, float]]] = field(default_factory=dict)
    pos_item: Dict[int, List[Tuple[int, float]]] = field(default_factory=dict)
    X: np.ndarray = None  # (n_users, d)
    Y: np.ndarray = None  # (n_items, d)

    def _reset(self, rows):
        self.pos_user = {}
        self.pos_item = {}
        for u, i, w in rows:
            w = max(float(w), 0.0)
            self.pos_user.setdefault(u, []).append((i, w))
            self.pos_item.setdefault(i, []).append((u, w))

    def fit(self, rows: Sequence[Tuple[int, int, float]], n_users: int, n_items: int):
        if not rows:
            raise ValueError("Empty training interactions; use content/popular cold start instead.")
        d = max(1, min(int(self.n_factors), n_users, n_items))
        self._reset(rows)
        rng = np.random.default_rng(self.seed)
        X = rng.normal(0, 0.1, (n_users, d))
        Y = rng.normal(0, 0.1, (n_items, d))
        lam = self.lambda_reg
        alpha = self.alpha_conf
        I = np.eye(d)

        for _ in range(int(self.iters)):
            # --- X (user factors) ---
            YtY = (Y.T @ Y) + lam * I
            for u, pairs in self.pos_user.items():
                A = YtY.copy()
                b = np.zeros(d)
                for it, w in pairs:
                    c = 1.0 + alpha * w
                    A += (c - 1.0) * np.outer(Y[it], Y[it])
                    b += c * Y[it]          # p_u = 1 for observed positives
                try:
                    X[u] = np.linalg.solve(A, b)
                except np.linalg.LinAlgError:
                    X[u] = np.linalg.lstsq(A, b, rcond=None)[0] if A.sum() else np.zeros(d)
            # Zero out users without positives (pure-noise rows must not be ranked).
            for u in range(n_users):
                if u not in self.pos_user:
                    X[u] = np.zeros(d)

            # --- Y (item factors) ---
            XtX = (X.T @ X) + lam * I
            for it, pairs in self.pos_item.items():
                A = XtX.copy()
                b = np.zeros(d)
                for usr, w in pairs:
                    c = 1.0 + alpha * w
                    A += (c - 1.0) * np.outer(X[usr], X[usr])
                    b += c * X[usr]
                try:
                    Y[it] = np.linalg.solve(A, b)
                except np.linalg.LinAlgError:
                    Y[it] = np.linalg.lstsq(A, b, rcond=None)[0] if A.sum() else np.zeros(d)
            for it in range(n_items):
                if it not in self.pos_item:
                    Y[it] = np.zeros(d)

        self.X, self.Y = X, Y
        return self

    def score_user(self, u: int) -> np.ndarray:
        return self.X[u] @ self.Y.T

    def top_items(self, u: int, exclude: set, top_n: int) -> List[int]:
        s = self.score_user(u)
        order = np.argsort(s)[::-1].tolist()
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
        return "als"
