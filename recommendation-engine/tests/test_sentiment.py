"""Unit tests for the sentiment analysis layer (``recommender.sentiment``)."""
from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from recommender import database, sentiment
from recommender.config import Config


class AnalyzeTest(unittest.TestCase):
    def test_english_positive(self):
        result = sentiment.analyze("This is a great and beautiful product, I love it")
        self.assertEqual(result.label, "positive")
        self.assertGreater(result.score, 0)

    def test_english_negative(self):
        result = sentiment.analyze("Terrible quality, it arrived broken and I hate it")
        self.assertEqual(result.label, "negative")
        self.assertLess(result.score, 0)

    def test_chinese_positive(self):
        result = sentiment.analyze("质量很好，非常喜欢，值得推荐")
        self.assertEqual(result.label, "positive")

    def test_chinese_negative(self):
        result = sentiment.analyze("质量很差，收到就破损了，非常失望")
        self.assertEqual(result.label, "negative")

    def test_negation_flips_english(self):
        positive = sentiment.analyze("good product")
        negated = sentiment.analyze("not good product")
        self.assertGreater(positive.score, 0)
        self.assertLess(negated.score, positive.score)

    def test_negation_flips_chinese(self):
        positive = sentiment.analyze("好用")
        negated = sentiment.analyze("不好用")
        self.assertGreater(positive.score, negated.score)

    def test_intensifier_increases_magnitude(self):
        plain = sentiment.analyze("good")
        strong = sentiment.analyze("very good")
        self.assertGreater(strong.score, plain.score)

    def test_neutral_text(self):
        result = sentiment.analyze("The parcel arrived on Tuesday")
        self.assertEqual(result.label, "neutral")
        self.assertAlmostEqual(result.score, 0.0, places=3)

    def test_rating_only_is_used(self):
        self.assertEqual(sentiment.analyze(None, 5).label, "positive")
        self.assertEqual(sentiment.analyze(None, 1).label, "negative")
        self.assertEqual(sentiment.analyze(None, 3).label, "neutral")

    def test_rating_fuses_with_text(self):
        text_only = sentiment.analyze("good")
        fused = sentiment.analyze("good", 5)
        self.assertGreaterEqual(fused.score, text_only.score)

    def test_empty_input(self):
        result = sentiment.analyze("")
        self.assertEqual(result.label, "neutral")
        self.assertEqual(result.score, 0.0)


class SummarizeTest(unittest.TestCase):
    def test_counts_and_ratios(self):
        results = [
            sentiment.analyze("great"),
            sentiment.analyze("perfect"),
            sentiment.analyze("terrible"),
            sentiment.analyze("plain text"),
        ]
        summary = sentiment.summarize(results)
        self.assertEqual(summary["total"], 4)
        self.assertEqual(summary["positive"], 2)
        self.assertEqual(summary["negative"], 1)
        self.assertEqual(summary["neutral"], 1)
        self.assertAlmostEqual(summary["positive_ratio"], 0.5, places=3)
        self.assertAlmostEqual(summary["negative_ratio"], 0.25, places=3)

    def test_average_rating_ignores_missing(self):
        results = [
            sentiment.analyze("great", 5),
            sentiment.analyze("ok", None),
            sentiment.analyze("bad", 1),
        ]
        summary = sentiment.summarize(results)
        self.assertAlmostEqual(summary["average_rating"], 3.0, places=3)

    def test_top_terms_are_reported(self):
        results = [sentiment.analyze("great great terrible")]
        summary = sentiment.summarize(results)
        self.assertEqual(summary["top_positive_terms"][0][0], "great")
        self.assertEqual(summary["top_negative_terms"][0][0], "terrible")

    def test_empty_summary(self):
        summary = sentiment.summarize([])
        self.assertEqual(summary["total"], 0)
        self.assertEqual(summary["positive_ratio"], 0.0)
        self.assertIsNone(summary["average_rating"])


class BuildReportTest(unittest.TestCase):
    def test_groups_by_product(self):
        reviews = [
            {"product_id": "p1", "text": "great", "rating": 5},
            {"product_id": "p1", "text": "bad", "rating": 1},
            {"product_id": "p2", "text": "very good", "rating": 4},
        ]
        report = sentiment.build_report(reviews, generated_at="2026-10-22T00:00:00Z")
        self.assertEqual(report["model_version"], "sentiment-v1")
        self.assertEqual(report["generated_at"], "2026-10-22T00:00:00Z")
        self.assertEqual(report["overall"]["total"], 3)
        self.assertEqual(set(report["by_product"]), {"p1", "p2"})
        self.assertEqual(report["by_product"]["p1"]["total"], 2)

    def test_report_contains_no_raw_text_or_identity(self):
        # Aggregate term counts may contain lexicon words, but the raw review text
        # and any reviewer identity must never be exported.
        reviews = [{"product_id": "p1", "text": "zzunique phrase great", "rating": 5}]
        report = sentiment.build_report(reviews)
        serialized = str(report)
        self.assertNotIn("customer", serialized.lower())
        self.assertNotIn("zzunique", serialized)

    def test_by_store_aggregation(self):
        reviews = [
            {"product_id": "p1", "text": "great", "rating": 5},
            {"product_id": "p1", "text": "bad", "rating": 1},
            {"product_id": "p2", "text": "very good", "rating": 4},
        ]
        report = sentiment.build_report(
            reviews, product_to_store={"p1": "store_a", "p2": "store_a"}
        )
        self.assertEqual(report["by_store"]["store_a"]["total"], 3)
        self.assertEqual(report["by_store"]["store_a"]["positive"], 2)
        self.assertEqual(report["by_store"]["store_a"]["negative"], 1)

    def test_by_store_is_empty_without_mapping(self):
        report = sentiment.build_report([{"product_id": "p1", "text": "great"}])
        self.assertEqual(report["by_store"], {})

    def test_by_store_skips_unmapped_products(self):
        reviews = [
            {"product_id": "p1", "text": "great"},
            {"product_id": "p2", "text": "great"},
        ]
        report = sentiment.build_report(
            reviews, product_to_store={"p1": "store_a"}
        )
        self.assertEqual(set(report["by_store"]), {"store_a"})
        self.assertEqual(report["by_store"]["store_a"]["total"], 1)


class PickReviewTableTest(unittest.TestCase):
    def test_selects_review_table(self):
        info = database.SchemaInfo(tables={
            "public.review": ["id", "product_id", "customer_id", "rating", "content", "status"],
            "public.product": ["id", "title"],
        })
        self.assertEqual(sentiment.pick_review_table(info), "public.review")

    def test_rejects_unrelated_tables(self):
        info = database.SchemaInfo(tables={
            "public.order_item": ["id", "order_id", "product_id", "quantity"],
            "public.product": ["id", "title", "handle"],
        })
        self.assertIsNone(sentiment.pick_review_table(info))

    def test_prefers_name_match(self):
        info = database.SchemaInfo(tables={
            "public.some_product_feedback": ["id", "product_id", "rating", "content"],
            "public.product_review": ["id", "product_id", "rating", "content"],
        })
        self.assertEqual(sentiment.pick_review_table(info), "public.product_review")


class LoadReviewsSqliteTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "reviews.db"
        conn = sqlite3.connect(str(self.path))
        try:
            conn.executescript(
                """
                CREATE TABLE review (
                    id TEXT PRIMARY KEY,
                    product_id TEXT,
                    rating INTEGER,
                    title TEXT,
                    content TEXT,
                    status TEXT
                );
                CREATE TABLE product (
                    id TEXT PRIMARY KEY,
                    title TEXT,
                    store_id TEXT
                );
                """
            )
            conn.executemany(
                "INSERT INTO review VALUES (?,?,?,?,?,?)",
                [
                    ("r1", "p1", 5, "Great", "Lovely quality", "published"),
                    ("r2", "p1", 1, "Bad", "Arrived broken", "published"),
                    ("r3", "p2", 3, "OK", "It is fine", "published"),
                    ("r4", "p3", 5, "Spam", "buy now", "spam"),
                ],
            )
            conn.executemany(
                "INSERT INTO product VALUES (?,?,?)",
                [
                    ("p1", "P1", "store_a"),
                    ("p2", "P2", "store_a"),
                    ("p3", "P3", "store_b"),
                ],
            )
            conn.commit()
        finally:
            conn.close()
        self.cfg = Config(database_url=f"sqlite:///{self.path.as_posix()}")

    def test_resolves_and_loads_reviews(self):
        info = database.list_schema(self.cfg)
        key = sentiment.pick_review_table(info)
        self.assertEqual(key, "main.review")

        reviews = sentiment.load_reviews(self.cfg, info, key)
        # spam review must be filtered out by status
        self.assertEqual(len(reviews), 3)
        self.assertEqual({r["product_id"] for r in reviews}, {"p1", "p2"})
        first = next(r for r in reviews if r["product_id"] == "p1")
        self.assertIn("Lovely", first["text"])
        self.assertEqual(first["rating"], 5)

    def test_end_to_end_report_from_sqlite(self):
        info = database.list_schema(self.cfg)
        key = sentiment.pick_review_table(info)
        reviews = sentiment.load_reviews(self.cfg, info, key)
        report = sentiment.build_report(reviews)
        self.assertEqual(report["overall"]["total"], 3)
        self.assertEqual(report["by_product"]["p1"]["total"], 2)
        self.assertGreaterEqual(report["overall"]["positive"], 1)

    def test_product_store_map_from_sqlite(self):
        info = database.list_schema(self.cfg)
        database.resolve_roles(self.cfg, info)
        mapping = sentiment.load_product_store_map(self.cfg, info)
        self.assertEqual(mapping.get("p1"), "store_a")
        self.assertEqual(mapping.get("p2"), "store_a")
        self.assertEqual(mapping.get("p3"), "store_b")

    def test_report_by_store_from_sqlite(self):
        info = database.list_schema(self.cfg)
        database.resolve_roles(self.cfg, info)
        key = sentiment.pick_review_table(info)
        reviews = sentiment.load_reviews(self.cfg, info, key)
        mapping = sentiment.load_product_store_map(self.cfg, info)
        report = sentiment.build_report(reviews, product_to_store=mapping)
        self.assertIn("store_a", report["by_store"])
        # store_a owns p1 (2 reviews) and p2 (1 review); p3's review is spam.
        self.assertEqual(report["by_store"]["store_a"]["total"], 3)
        self.assertEqual(
            report["by_store"]["store_a"]["total"],
            report["by_product"]["p1"]["total"] + report["by_product"]["p2"]["total"],
        )


class MedusaLayoutSqliteTest(unittest.TestCase):
    """Medusa v2 layout: soft-deleted reviews + product↔store link table."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "medusa.db"
        conn = sqlite3.connect(str(self.path))
        try:
            conn.executescript(
                """
                CREATE TABLE product_review (
                    id TEXT PRIMARY KEY,
                    product_id TEXT,
                    rating INTEGER,
                    content TEXT,
                    status TEXT,
                    deleted_at TEXT
                );
                CREATE TABLE product (
                    id TEXT PRIMARY KEY,
                    title TEXT
                );
                CREATE TABLE product_product_store_store (
                    id TEXT PRIMARY KEY,
                    product_id TEXT,
                    store_id TEXT
                );
                CREATE TABLE product_product_collection_store_store (
                    id TEXT PRIMARY KEY,
                    product_collection_id TEXT,
                    store_id TEXT
                );
                """
            )
            conn.executemany(
                "INSERT INTO product_review VALUES (?,?,?,?,?,?)",
                [
                    ("r1", "p1", 5, "质量很好，非常喜欢", "approved", None),
                    ("r2", "p1", 2, "有线头，不太满意", "approved", None),
                    ("r3", "p2", 4, "很漂亮，值得买", "approved", None),
                    ("r4", "p2", 1, "很差，不建议购买", "approved", "2026-10-24 00:00:00"),
                ],
            )
            conn.executemany(
                "INSERT INTO product VALUES (?,?)",
                [("p1", "毛衣"), ("p2", "马克杯")],
            )
            conn.executemany(
                "INSERT INTO product_product_store_store VALUES (?,?,?)",
                [("l1", "p1", "store_a"), ("l2", "p2", "store_b")],
            )
            conn.executemany(
                "INSERT INTO product_product_collection_store_store VALUES (?,?,?)",
                [("c1", "col_1", "store_decoy")],
            )
            conn.commit()
        finally:
            conn.close()
        self.cfg = Config(database_url=f"sqlite:///{self.path.as_posix()}")

    def test_soft_deleted_reviews_are_excluded(self):
        info = database.list_schema(self.cfg)
        key = sentiment.pick_review_table(info)
        reviews = sentiment.load_reviews(self.cfg, info, key)
        self.assertEqual(len(reviews), 3)
        self.assertEqual({r["product_id"] for r in reviews}, {"p1", "p2"})
        p2_ratings = [r["rating"] for r in reviews if r["product_id"] == "p2"]
        self.assertEqual(p2_ratings, [4])

    def test_store_map_resolves_via_link_table(self):
        info = database.list_schema(self.cfg)
        database.resolve_roles(self.cfg, info)
        mapping = sentiment.load_product_store_map(self.cfg, info)
        # The collection-store decoy must never be mistaken for ownership.
        self.assertEqual(mapping, {"p1": "store_a", "p2": "store_b"})

    def test_report_by_store_via_link_table(self):
        info = database.list_schema(self.cfg)
        database.resolve_roles(self.cfg, info)
        key = sentiment.pick_review_table(info)
        reviews = sentiment.load_reviews(self.cfg, info, key)
        mapping = sentiment.load_product_store_map(self.cfg, info)
        report = sentiment.build_report(reviews, product_to_store=mapping)
        self.assertEqual(report["overall"]["total"], 3)
        self.assertIn("store_a", report["by_store"])
        self.assertIn("store_b", report["by_store"])
        self.assertEqual(report["by_store"]["store_a"]["total"], 2)
        # p2's soft-deleted review must not reach store_b either.
        self.assertEqual(report["by_store"]["store_b"]["total"], 1)


if __name__ == "__main__":
    unittest.main()
