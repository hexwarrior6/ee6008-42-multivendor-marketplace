"""Optional LightFM wrapper (production-grade hybrid model; needs lightfm + scipy + numpy).

Unlike the bundled SVD/ALS, LightFM can mix collaborative signals with user/item features.
Here only the observed purchase history is fed in (pure collaborative); features can be
added later. If lightfm is not installed the model is skipped with a clear message.
"""
from __future__ import annotations

from typing import List, Sequence, Tuple

import numpy as np


def available() -> bool:
    """True when the lightfm package can be imported."""
    try:
        import lightfm  # noqa: F401
        return True
    except Exception:  # noqa: BLE001
        return False


class LightFMPredictor:
    # LightFM's native solver can crash (segfault) on tiny/sparse data, so enforce a
    # minimum size and raise a clear error that train.py catches and skips.
    MIN_NNZ = 50
    MIN_USERS = 5
    MIN_ITEMS = 5

    def __init__(self, n_factors: int = 32, iters: int = 12, seed: int = 0):
        if not available():
            raise ImportError("LightFM is not installed (pip install lightfm scipy).")
        from lightfm import LightFM

        # Use logistic rather than warp: warp's QP solver easily triggers native crashes
        # on very sparse / tiny datasets.
        self._model = LightFM(no_components=n_factors, learning_schedule="adagrad",
                              loss="logistic", random_state=seed)
        self.iters = iters

    def _fit(self, rows, n_users, n_items):
        from scipy import sparse

        # Interaction matrix: rows = users, columns = items, values = weights.
        coo_u = [u for (u, _i, _w) in rows]
        coo_i = [i for (_u, i, _w) in rows]
        coo_d = [w for (_u, _i, w) in rows]
        mat = sparse.coo_matrix((coo_d, (coo_u, coo_i)), shape=(n_users, n_items)).tocsr()
        self._model.fit(mat, epochs=self.iters, num_threads=1)

    # Same interface as svd/als; rows come from train.py.
    def fit(self, rows: Sequence[Tuple[int, int, float]], n_users: int, n_items: int):
        if len(rows) < self.MIN_NNZ or n_users < self.MIN_USERS or n_items < self.MIN_ITEMS:
            raise RuntimeError(
                f"Data too small (interactions {len(rows)}, users {n_users}, items {n_items}); "
                "LightFM is unstable here and was skipped. Use svd/als or retry with more data."
            )
        self.n_users = n_users
        self.n_items = n_items
        self._fit(rows, n_users, n_items)
        return self

    def mean_pred(self, u_slice: np.ndarray, item_ids: np.ndarray) -> np.ndarray:
        return self._model.predict(u_slice, item_ids, num_threads=1)

    def score_user(self, u: int) -> np.ndarray:
        items = np.arange(self.n_items if self.n_items else 0)
        return self._model.predict(np.full(items.shape, u, dtype=np.int32),
                                   items.astype(np.int32), num_threads=1) if items.size else np.zeros(0)

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
        return "lightfm"
