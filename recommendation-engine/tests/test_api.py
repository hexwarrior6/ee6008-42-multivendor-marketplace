"""Unit tests for the read-only recommendation API (``src/recommender/api.py``).

Kept dependency-light: the pure selection/loading helpers are tested directly, while
HTTP endpoint tests run only when fastapi's TestClient (httpx) is available.
"""
from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path

from recommender import api


def _item(pid: str, score: float = 1.0, **extra) -> dict:
    base = {
        "product_id": pid,
        "title": f"title-{pid}",
        "handle": pid,
        "thumbnail": None,
        "score": score,
    }
    base.update(extra)
    return base


class SelectItemsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.artifact = {
            "by_user": {"cus_1": [_item("p1"), _item("p2")]},
            "by_product": {"seed": [_item("p3"), _item("p4")]},
            "fallback": [_item("p5"), _item("p6")],
        }

    def test_by_user_has_priority(self):
        items, strategy = api.select_items(self.artifact, "cus_1", "seed", 8)
        self.assertEqual(strategy, "by_user")
        self.assertEqual([i["product_id"] for i in items], ["p1", "p2"])

    def test_falls_back_to_product_when_no_user(self):
        items, strategy = api.select_items(self.artifact, None, "seed", 8)
        self.assertEqual(strategy, "by_product")
        self.assertEqual([i["product_id"] for i in items], ["p3", "p4"])

    def test_falls_back_to_global_when_nothing_matches(self):
        items, strategy = api.select_items(self.artifact, "unknown", "unknown", 8)
        self.assertEqual(strategy, "fallback")
        self.assertEqual([i["product_id"] for i in items], ["p5", "p6"])

    def test_seed_product_is_excluded(self):
        artifact = {
            "by_product": {"seed": [_item("seed"), _item("other")]},
            "fallback": [],
        }
        items, strategy = api.select_items(artifact, None, "seed", 8)
        self.assertEqual(strategy, "by_product")
        self.assertEqual([i["product_id"] for i in items], ["other"])

    def test_limit_is_applied(self):
        items, _ = api.select_items(self.artifact, "cus_1", None, 1)
        self.assertEqual(len(items), 1)

    def test_duplicates_are_removed(self):
        artifact = {
            "by_user": {"cus_1": [_item("p1"), _item("p1"), _item("p2")]},
            "fallback": [],
        }
        items, _ = api.select_items(artifact, "cus_1", None, 8)
        self.assertEqual([i["product_id"] for i in items], ["p1", "p2"])

    def test_thumbnail_none_placeholder_normalised(self):
        artifact = {
            "by_user": {"cus_1": [_item("p1", thumbnail="None")]},
            "fallback": [],
        }
        items, _ = api.select_items(artifact, "cus_1", None, 8)
        self.assertIsNone(items[0]["thumbnail"])

    def test_empty_artifact_returns_empty(self):
        items, strategy = api.select_items({}, "cus_1", "seed", 8)
        self.assertEqual(items, [])
        self.assertEqual(strategy, "empty")


class LoadArtifactTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.old = os.environ.get("RECOMMENDATIONS_PATH")
        self.addCleanup(self._restore_env)

    def _restore_env(self):
        if self.old is None:
            os.environ.pop("RECOMMENDATIONS_PATH", None)
        else:
            os.environ["RECOMMENDATIONS_PATH"] = self.old

    def test_missing_artifact_degrades(self):
        os.environ["RECOMMENDATIONS_PATH"] = str(Path(self.tmp.name) / "missing.json")
        data = api.load_artifact()
        self.assertEqual(data["source"], "unavailable")
        self.assertEqual(data["fallback"], [])

    def test_valid_artifact_is_loaded(self):
        path = Path(self.tmp.name) / "recs.json"
        path.write_text(
            json.dumps(
                {
                    "by_user": {"cus_1": [_item("p1")]},
                    "by_product": {},
                    "fallback": [_item("p2")],
                    "source": "als",
                    "model_version": "v1",
                    "generated_at": "2026-10-18T00:00:00Z",
                }
            ),
            encoding="utf-8",
        )
        os.environ["RECOMMENDATIONS_PATH"] = str(path)
        data = api.load_artifact()
        self.assertEqual(data["source"], "als")
        self.assertEqual(list(data["by_user"]), ["cus_1"])

    def test_corrupt_json_degrades(self):
        path = Path(self.tmp.name) / "bad.json"
        path.write_text("{not json", encoding="utf-8")
        os.environ["RECOMMENDATIONS_PATH"] = str(path)
        data = api.load_artifact()
        self.assertEqual(data["source"], "unavailable")


try:  # fastapi's TestClient needs httpx; skip endpoint tests when unavailable
    from fastapi.testclient import TestClient

    _HAS_TESTCLIENT = True
except Exception:  # noqa: BLE001  # pragma: no cover
    _HAS_TESTCLIENT = False


@unittest.skipUnless(_HAS_TESTCLIENT, "fastapi TestClient (httpx) not installed")
class EndpointTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        path = Path(self.tmp.name) / "recs.json"
        path.write_text(
            json.dumps(
                {
                    "by_user": {"cus_1": [_item("p1", score=0.9)]},
                    "by_product": {"seed": [_item("p2", score=0.5)]},
                    "fallback": [_item("p3", score=0.1)],
                    "source": "als",
                    "model_version": "v1",
                    "generated_at": "2026-10-18T00:00:00Z",
                }
            ),
            encoding="utf-8",
        )
        self._old = os.environ.get("RECOMMENDATIONS_PATH")
        os.environ["RECOMMENDATIONS_PATH"] = str(path)
        self.addCleanup(self._restore)
        self.client = TestClient(api.app)

    def _restore(self):
        if self._old is None:
            os.environ.pop("RECOMMENDATIONS_PATH", None)
        else:
            os.environ["RECOMMENDATIONS_PATH"] = self._old

    def test_health(self):
        body = self.client.get("/health").json()
        self.assertEqual(body["status"], "ok")
        self.assertEqual(body["source"], "als")

    def test_recommendations_contract(self):
        body = self.client.get("/recommendations", params={"customer_id": "cus_1"}).json()
        self.assertEqual(body["strategy"], "by_user")
        self.assertTrue(body["personalized"])
        item = body["recommendations"][0]
        for field in ("product_id", "title", "handle", "thumbnail", "score"):
            self.assertIn(field, item)

    def test_product_query_excludes_seed(self):
        body = self.client.get("/recommendations", params={"product_id": "seed"}).json()
        self.assertEqual([i["product_id"] for i in body["recommendations"]], ["p2"])

    def test_limit_validation(self):
        self.assertEqual(
            self.client.get("/recommendations", params={"limit": 0}).status_code, 422
        )
        self.assertEqual(
            self.client.get("/recommendations", params={"limit": 25}).status_code, 422
        )

    def test_invalid_id_rejected(self):
        self.assertEqual(
            self.client.get(
                "/recommendations", params={"customer_id": "bad id!"}
            ).status_code,
            422,
        )


if __name__ == "__main__":
    unittest.main()
