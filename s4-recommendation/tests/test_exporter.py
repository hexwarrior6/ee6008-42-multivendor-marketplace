"""Unit tests for exporter.py: RecommendationItem contract fields, export shapes, JSON roundtrip."""
import json
import os
import sys
import tempfile
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from recommender.content_based import ContentRecommender  # noqa: E402
from recommender.data_loader import CatalogItem  # noqa: E402
from recommender.exporter import (  # noqa: E402
    dump,
    export_fallback,
    export_product_similar,
    export_user,
    load,
    make_item,
)
from recommender.preprocessing import CleanData  # noqa: E402

CONTRACT_FIELDS = {"product_id", "title", "handle", "thumbnail", "score", "reason"}


class FixedModel:
    def __init__(self, scores):
        self.scores = np.asarray(scores, float)

    def score_user(self, u):
        return self.scores

    def top_items(self, u, exclude, top_n):
        order = np.argsort(self.scores)[::-1].tolist()
        return [int(i) for i in order if i not in exclude][:top_n]


def make_cd():
    return CleanData(user_ids=["c1"], item_ids=["p0", "p1", "p2"], rows=[(0, 0, 1.0)])


class ExporterTest(unittest.TestCase):
    def setUp(self):
        self.cd = make_cd()
        self.titles = {"p0": "Pot", "p1": "Cup", "p2": "Soap"}
        self.handles = {"p0": "pot", "p1": "cup", "p2": "soap"}
        self.thumbs = {}

    def test_make_item_matches_contract(self):
        item = make_item(self.cd, 1, 0.5, self.titles, self.handles, self.thumbs)
        self.assertEqual(set(item), CONTRACT_FIELDS)
        self.assertEqual(item["product_id"], "p1")
        self.assertEqual(item["title"], "Cup")
        self.assertEqual(item["handle"], "cup")
        self.assertIsNone(item["reason"])

    def test_export_user_excludes_history_and_keeps_scores(self):
        out = export_user(FixedModel([0.9, 0.5, 0.1]), self.cd, 2,
                          self.titles, self.handles, self.thumbs)
        recs = out["c1"]
        ids = [r["product_id"] for r in recs]
        self.assertNotIn("p0", ids)                 # history excluded
        self.assertEqual(ids[0], "p1")              # next best score
        self.assertTrue(all(set(r) == CONTRACT_FIELDS for r in recs))

    def test_export_product_similar_uses_content(self):
        cat = [CatalogItem("p0", "ceramic pot", meta={"categories": "ceramic"}),
               CatalogItem("p1", "ceramic cup", meta={"categories": "ceramic"}),
               CatalogItem("p2", "handmade soap", meta={"categories": "aroma"})]
        content = ContentRecommender().fit(cat)
        out = export_product_similar(content, self.cd, 2, self.titles, self.handles, self.thumbs)
        self.assertIn("p0", out)
        self.assertIn("p1", [r["product_id"] for r in out["p0"]])   # same category

    def test_export_fallback_structure(self):
        cat = [CatalogItem("p0", "ceramic pot", meta={"categories": "ceramic"})]
        content = ContentRecommender().fit(cat, freq={"p0": 3})
        fb = export_fallback(content, 1, self.titles, self.handles, self.thumbs)
        self.assertEqual(fb[0]["product_id"], "p0")
        self.assertTrue({"product_id", "title", "handle", "thumbnail", "score"}.issubset(fb[0]))

    def test_dump_and_load_roundtrip(self):
        payload = {"by_user": {"c1": []}, "by_product": {}, "fallback": []}
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "r.json")
            dump(path, payload, "svd", version="v-test")
            data = load(path)
        self.assertEqual(data["source"], "svd")
        self.assertEqual(data["model_version"], "v-test")
        self.assertIn("generated_at", data)


if __name__ == "__main__":
    unittest.main()
