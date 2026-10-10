"""Unit tests for preprocessing.py: cleaning rules, weight aggregation, index mapping, split."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from recommender.data_loader import CatalogItem, Interaction  # noqa: E402
from recommender.preprocessing import (  # noqa: E402
    CleanData,
    clean_interactions,
    describe,
    train_test_split,
)


CATALOG = [CatalogItem("p1"), CatalogItem("p2"), CatalogItem("p3")]


class CleanInteractionsTest(unittest.TestCase):
    def test_filters_invalid_and_out_of_catalog(self):
        rows = [
            Interaction("c1", "p1"),
            Interaction("", "p1"),          # empty customer -> dropped
            Interaction("c1", ""),          # empty product  -> dropped
            Interaction("c1", "pX"),        # not in catalogue -> dropped
            Interaction("c1", "p2", weight=0),             # non-positive weight -> dropped
            Interaction("c1", "p2", weight=float("nan")),  # non-finite -> dropped
            Interaction("c2", "p3"),        # valid
        ]
        cd = clean_interactions(rows, CATALOG)
        self.assertEqual(cd.non_zero, 2)
        self.assertEqual(set(cd.user_ids), {"c1", "c2"})

    def test_weight_accumulates_for_repeat_purchase(self):
        rows = [Interaction("c1", "p1", weight=1.0), Interaction("c1", "p1", weight=2.0)]
        cd = clean_interactions(rows, CATALOG)
        self.assertEqual(cd.non_zero, 1)
        self.assertEqual(cd.rows[0][2], 3.0)

    def test_index_mapping_is_compact(self):
        rows = [Interaction(f"c{i}", "p1") for i in range(3)]
        cd = clean_interactions(rows, CATALOG)
        self.assertEqual(cd.n_users, 3)
        self.assertEqual(cd.n_items, 1)
        self.assertTrue(all(0 <= u < cd.n_users for u, _i, _w in cd.rows))
        self.assertTrue(all(i == 0 for _u, i, _w in cd.rows))


class SplitTest(unittest.TestCase):
    def _cd(self):
        rows = []
        for u in range(10):
            for i in range(len(CATALOG)):
                rows.append(Interaction(f"c{u}", CATALOG[i].product_id))
        return clean_interactions(rows, CATALOG)

    def test_holdout_produces_ground_and_keeps_dimensions(self):
        cd = self._cd()
        train, ground, test = train_test_split(cd, holdout_per_user=1, seed=7)
        self.assertEqual(len(ground), 10)                        # one held out per user
        self.assertEqual(train.n_users, cd.n_users)              # dimensions unchanged
        self.assertEqual(train.n_items, cd.n_items)
        self.assertEqual(train.non_zero, cd.non_zero - 10)
        self.assertEqual(test.non_zero, 10)
        for items in ground.values():
            self.assertEqual(len(items), 1)

    def test_split_is_deterministic_with_seed(self):
        cd = self._cd()
        _, g1, _ = train_test_split(cd, 1, seed=42)
        _, g2, _ = train_test_split(cd, 1, seed=42)
        self.assertEqual(g1, g2)

    def test_users_with_too_few_interactions_are_not_held_out(self):
        rows = [Interaction("cA", "p1"), Interaction("cB", "p1"),
                Interaction("cB", "p2"), Interaction("cB", "p3")]
        cd = clean_interactions(rows, CATALOG)
        train, ground, _ = train_test_split(cd, holdout_per_user=1, seed=0)
        self.assertNotIn("cA", ground)          # only 1 row -> not held out
        self.assertIn("cB", ground)
        self.assertEqual(train.non_zero, 3)


class DescribeTest(unittest.TestCase):
    def test_describe_mentions_counts(self):
        cd = CleanData(user_ids=["c1"], item_ids=["p1"], rows=[(0, 0, 1.0)])
        self.assertIn("users=1", describe(cd))
        self.assertIn("items=1", describe(cd))


if __name__ == "__main__":
    unittest.main()
