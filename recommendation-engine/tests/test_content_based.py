"""Unit tests for content_based.py: tokenisation, similarity, popularity fallback, seed fusion."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from recommender.content_based import ContentRecommender, _tokens  # noqa: E402
from recommender.data_loader import CatalogItem  # noqa: E402


def build():
    cat = [
        CatalogItem("p_pot", "ceramic teapot", meta={"categories": "ceramic"}),
        CatalogItem("p_cup", "ceramic cup", meta={"categories": "ceramic"}),
        CatalogItem("p_soap", "herbal soap", meta={"categories": "aroma"}),
        CatalogItem("p_candle", "soy candle", meta={"categories": "aroma"}),
    ]
    return ContentRecommender().fit(cat, freq={"p_pot": 5, "p_cup": 3, "p_soap": 2, "p_candle": 1})


class TokenTest(unittest.TestCase):
    def test_splits_cjk_and_latin(self):
        toks = _tokens("陶瓷 teapot 2")
        self.assertIn("陶", toks)
        self.assertIn("teapot", toks)
        self.assertIn("2", toks)


class ContentTest(unittest.TestCase):
    def test_similar_prefers_same_category(self):
        rec = build()
        sim = rec.similar_by_pid("p_pot", top_n=3)
        self.assertTrue(sim)
        self.assertEqual(sim[0][0], "p_cup")          # same category is most similar
        self.assertGreater(sim[0][1], 0.0)

    def test_similar_respects_exclude(self):
        rec = build()
        sim = rec.similar_by_pid("p_pot", top_n=3, exclude={"p_cup"})
        self.assertNotIn("p_cup", [pid for pid, _ in sim])

    def test_unknown_pid_falls_back_to_popular(self):
        rec = build()
        sim = rec.similar_by_pid("does-not-exist", top_n=2)
        self.assertEqual(sim[0][0], "p_pot")          # most popular first

    def test_top_n_all_returns_n_items(self):
        rec = build()
        self.assertEqual(len(rec.top_n_all(3)), 3)

    def test_recommend_by_seed_excludes_seeds(self):
        rec = build()
        out = rec.recommend_by_seed(["p_pot"], top_n=3)
        self.assertNotIn("p_pot", [pid for pid, _ in out])
        self.assertTrue(out)

    def test_recommend_by_seed_empty_goes_popular(self):
        rec = build()
        out = rec.recommend_by_seed([], top_n=2)
        self.assertEqual(out[0][0], "p_pot")


if __name__ == "__main__":
    unittest.main()
