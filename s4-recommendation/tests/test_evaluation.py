"""Unit tests for evaluation.py: precision@K / recall@K / hit@K / coverage with a fixed model."""
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from recommender.evaluation import evaluate, user_seen  # noqa: E402
from recommender.preprocessing import CleanData  # noqa: E402


class FixedModel:
    """Returns a fixed score vector so metrics can be asserted exactly."""

    def __init__(self, scores):
        self._scores = np.asarray(scores, dtype=float)

    def score_user(self, u):
        return self._scores


class EvalTest(unittest.TestCase):
    def _train(self):
        # 1 user, 3 products; the user already bought p0.
        return CleanData(user_ids=["c1"], item_ids=["p0", "p1", "p2"], rows=[(0, 0, 1.0)])

    def test_perfect_top1(self):
        train = self._train()
        model = FixedModel([0.9, 0.5, 0.1])          # p0>p1>p2; after excluding p0, p1 is first
        b = evaluate(model, {"c1": ["p1"]}, train, train.item_ids, top_n=1)
        self.assertEqual(b.precision_at_k, 1.0)
        self.assertEqual(b.recall_at_k, 1.0)
        self.assertEqual(b.hit_rate, 1.0)
        self.assertEqual(b.n_evaluated, 1)
        self.assertAlmostEqual(b.coverage, 1 / 3)

    def test_k_denominator_and_coverage(self):
        train = self._train()
        model = FixedModel([0.9, 0.5, 0.1])
        b = evaluate(model, {"c1": ["p1"]}, train, train.item_ids, top_n=2)
        self.assertEqual(b.precision_at_k, 0.5)       # 1 hit / K=2
        self.assertEqual(b.recall_at_k, 1.0)
        self.assertAlmostEqual(b.coverage, 2 / 3)     # recommended p1 and p2

    def test_miss_gives_zero(self):
        train = self._train()
        model = FixedModel([0.9, 0.01, 0.001])       # p1 still first, but ground truth is p2
        b = evaluate(model, {"c1": ["p2"]}, train, train.item_ids, top_n=1)
        self.assertEqual(b.precision_at_k, 0.0)
        self.assertEqual(b.recall_at_k, 0.0)
        self.assertEqual(b.hit_rate, 0.0)

    def test_ground_for_unknown_user_is_skipped(self):
        train = self._train()
        b = evaluate(FixedModel([1.0, 0.0, 0.0]), {"ghost": ["p1"]}, train, train.item_ids, top_n=1)
        self.assertEqual(b.n_evaluated, 0)

    def test_user_seen_maps_history(self):
        train = self._train()
        self.assertEqual(user_seen(train), {0: {0}})

    def test_as_dict_has_expected_keys(self):
        b = evaluate(FixedModel([1.0, 0.0, 0.0]), {"c1": ["p1"]}, self._train(),
                     self._train().item_ids, top_n=1)
        keys = set(b.as_dict())
        self.assertTrue({"precision@K", "recall@K", "hit@K", "coverage"}.issubset(keys))


if __name__ == "__main__":
    unittest.main()
