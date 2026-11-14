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
from unittest.mock import patch

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
        self.key_env = patch.dict(os.environ, {"RECOMMENDATIONS_API_KEY": "test-api-secret"})
        self.key_env.start()
        self.addCleanup(self.key_env.stop)
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
        self.client = TestClient(api.app, headers={"X-API-Key": "test-api-secret"})

    def test_missing_key_is_rejected_without_exposing_recommendations(self):
        response = TestClient(api.app).get("/recommendations?customer_id=cus_1")
        self.assertEqual(response.status_code, 401)
        self.assertNotIn("recommendations", response.json())
        self.assertEqual(response.headers["cache-control"], "private, no-store")

    def test_wrong_key_is_rejected(self):
        response = self.client.get("/recommendations", headers={"X-API-Key": "wrong"})
        self.assertEqual(response.status_code, 401)
        self.assertNotIn("test-api-secret", response.text)

    def test_query_parameter_cannot_replace_header(self):
        response = TestClient(api.app).get(
            "/recommendations", params={"api_key": "test-api-secret", "customer_id": "cus_1"}
        )
        self.assertEqual(response.status_code, 401)

    def test_missing_or_blank_server_key_fails_closed(self):
        for key in (None, "", "   "):
            with self.subTest(key=key):
                if key is None:
                    os.environ.pop("RECOMMENDATIONS_API_KEY", None)
                else:
                    os.environ["RECOMMENDATIONS_API_KEY"] = key
                response = self.client.get("/recommendations")
                self.assertEqual(response.status_code, 503)
                self.assertNotIn("recommendations", response.json())

    def test_health_does_not_require_a_key(self):
        os.environ.pop("RECOMMENDATIONS_API_KEY", None)
        response = TestClient(api.app).get("/health")
        self.assertEqual(response.status_code, 200)

    def test_authenticated_response_is_not_shared_cached(self):
        response = self.client.get("/recommendations?customer_id=cus_1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "private, no-store")

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


class SentimentEndpointTest(unittest.TestCase):
    """/sentiment follows the same rules as /recommendations: auth, degrade, no-store."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "sentiment.json"
        self.path.write_text(
            json.dumps(
                {
                    "generated_at": "2026-10-23T00:00:00Z",
                    "model_version": "sentiment-v1",
                    "overall": {"total": 10, "positive": 6, "neutral": 2, "negative": 2},
                    "by_product": {
                        "p1": {"total": 4, "positive": 3, "neutral": 0, "negative": 1}
                    },
                    "by_store": {
                        "s1": {"total": 7, "positive": 4, "neutral": 2, "negative": 1}
                    },
                }
            ),
            encoding="utf-8",
        )
        self._old_sentiment = os.environ.get("SENTIMENT_PATH")
        self._old_key = os.environ.get("RECOMMENDATIONS_API_KEY")
        os.environ["SENTIMENT_PATH"] = str(self.path)
        os.environ["RECOMMENDATIONS_API_KEY"] = "test-api-secret"
        self.addCleanup(self._restore)
        self.client = TestClient(api.app, headers={"X-API-Key": "test-api-secret"})

    def _restore(self):
        if self._old_sentiment is None:
            os.environ.pop("SENTIMENT_PATH", None)
        else:
            os.environ["SENTIMENT_PATH"] = self._old_sentiment
        if self._old_key is None:
            os.environ.pop("RECOMMENDATIONS_API_KEY", None)
        else:
            os.environ["RECOMMENDATIONS_API_KEY"] = self._old_key

    def test_requires_api_key(self):
        response = TestClient(api.app).get("/sentiment")
        self.assertEqual(response.status_code, 401)
        self.assertNotIn("summary", response.json())

    def test_overall_when_no_filter(self):
        body = self.client.get("/sentiment").json()
        self.assertEqual(body["dimension"], "overall")
        self.assertEqual(body["summary"]["total"], 10)

    def test_product_dimension(self):
        body = self.client.get("/sentiment", params={"product_id": "p1"}).json()
        self.assertEqual(body["dimension"], "product")
        self.assertEqual(body["summary"]["total"], 4)

    def test_store_dimension(self):
        body = self.client.get("/sentiment", params={"store_id": "s1"}).json()
        self.assertEqual(body["dimension"], "store")
        self.assertEqual(body["summary"]["total"], 7)

    def test_product_takes_priority_over_store(self):
        body = self.client.get(
            "/sentiment", params={"product_id": "p1", "store_id": "s1"}
        ).json()
        self.assertEqual(body["dimension"], "product")

    def test_unknown_ids_do_not_leak_overall(self):
        body = self.client.get(
            "/sentiment", params={"product_id": "unknown", "store_id": "unknown"}
        ).json()
        self.assertEqual(body["dimension"], "unavailable")
        self.assertIsNone(body["summary"])

    def test_unknown_store_does_not_leak_overall(self):
        body = self.client.get("/sentiment", params={"store_id": "unknown"}).json()
        self.assertEqual(body["dimension"], "unavailable")
        self.assertIsNone(body["summary"])

    def test_missing_artifact_degrades(self):
        os.environ["SENTIMENT_PATH"] = str(Path(self.tmp.name) / "missing.json")
        body = self.client.get("/sentiment").json()
        self.assertEqual(body["dimension"], "unavailable")
        self.assertIsNone(body["summary"])
        self.assertEqual(body["source"], "unavailable")

    def test_invalid_id_rejected(self):
        self.assertEqual(
            self.client.get("/sentiment", params={"store_id": "bad id!"}).status_code,
            422,
        )

    def test_response_is_not_shared_cached(self):
        response = self.client.get("/sentiment")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "private, no-store")


if __name__ == "__main__":
    unittest.main()
