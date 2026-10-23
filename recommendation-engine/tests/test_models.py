"""Unit tests for the model layer: unified interface, history exclusion, guards.

SVD / ALS / LightFM share one interface (fit / score_user / top_items / name), so the same
assertions are run against each model — guaranteeing train.py can call them interchangeably
(duck typing).
"""
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from recommender.models.als_model import ALSPredictor  # noqa: E402
from recommender.models.svd_model import SVDPredictor  # noqa: E402


def toy_rows(n_users=12, n_items=9, seed=1):
    rng = np.random.default_rng(seed)
    rows = []
    for u in range(n_users):
        for i in rng.choice(n_items, size=3, replace=False).tolist():
            rows.append((u, int(i), 1.0))
    return rows, n_users, n_items


def model_cases():
    return [SVDPredictor(n_factors=4, user_mean=False), ALSPredictor(n_factors=4, iters=3, seed=0)]


class UnifiedInterfaceTest(unittest.TestCase):
    def test_fit_score_top_items_contract(self):
        rows, nu, ni = toy_rows()
        for model in model_cases():
            with self.subTest(model=model.name()):
                m = model.fit(rows, nu, ni)
                scores = m.score_user(0)
                self.assertEqual(len(scores), ni)
                self.assertTrue(np.all(np.isfinite(scores)))

                exclude = {i for (u, i, _w) in rows if u == 0}
                top = m.top_items(0, exclude, 3)
                self.assertEqual(len(top), 3)
                self.assertTrue(all(0 <= i < ni for i in top))
                self.assertTrue(exclude.isdisjoint(top))   # never recommend already-bought

    def test_top_items_respects_size(self):
        rows, nu, ni = toy_rows()
        for model in model_cases():
            with self.subTest(model=model.name()):
                m = model.fit(rows, nu, ni)
                self.assertLessEqual(len(m.top_items(0, set(), ni + 5)), ni)

    def test_empty_rows_raise(self):
        for model in model_cases():
            with self.subTest(model=model.name()):
                with self.assertRaises(ValueError):
                    model.fit([], 3, 3)

    def test_name_is_stable(self):
        self.assertEqual(SVDPredictor.name(), "svd")
        self.assertEqual(ALSPredictor.name(), "als")


class SvdSpecificTest(unittest.TestCase):
    def test_user_mean_variant_runs(self):
        rows, nu, ni = toy_rows()
        m = SVDPredictor(n_factors=3, user_mean=True).fit(rows, nu, ni)
        self.assertEqual(len(m.score_user(0)), ni)

    def test_score_before_fit_raises(self):
        with self.assertRaises(RuntimeError):
            SVDPredictor().score_user(0)


class LightFmTest(unittest.TestCase):
    def test_guard_skips_tiny_data(self):
        from recommender.models.lightfm_model import LightFMPredictor, available
        if not available():
            self.skipTest("LightFM is not installed")
        m = LightFMPredictor(n_factors=4, iters=2)
        with self.assertRaises(RuntimeError):
            m.fit([(0, 0, 1.0)], 1, 1)     # clearly too small -> guard must raise

    def test_trains_on_sufficient_data(self):
        from recommender.models.lightfm_model import LightFMPredictor, available
        if not available():
            self.skipTest("LightFM is not installed")
        rng = np.random.default_rng(3)
        nu, ni = 40, 15
        rows = [(u, int(i), 1.0)
                for u in range(nu)
                for i in rng.choice(ni, size=4, replace=False).tolist()]
        self.assertGreaterEqual(len(rows), 50)
        m = LightFMPredictor(n_factors=4, iters=2, seed=0).fit(rows, nu, ni)
        self.assertEqual(len(m.score_user(0)), ni)
        self.assertEqual(LightFMPredictor.name(), "lightfm")


if __name__ == "__main__":
    unittest.main()
