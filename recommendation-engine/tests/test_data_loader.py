"""Unit tests for data_loader.py: column aliases, catalogue load, purchase extraction (both
order-line layouts), view merge.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from recommender.config import Config  # noqa: E402
from recommender.database import SchemaInfo  # noqa: E402
from recommender.data_loader import (  # noqa: E402
    CatalogItem,
    Interaction,
    _pick,
    apply_views,
    fetch_catalog,
    fetch_purchases,
)


class FakeDriver:
    """Ignores SQL and returns preset rows (as dicts)."""

    def __init__(self, rows):
        self._rows = rows

    def query(self, sql, params=()):
        return list(self._rows)


INFO = SchemaInfo(
    tables={
        "public.order": ["id", "customer_id", "status"],
        "public.order_item": ["order_id", "product_id", "quantity", "unit_price"],
        "public.product": ["id", "title", "handle", "thumbnail"],
        "public.product_category": ["id", "name", "handle"],
        "public.product_category_product": ["product_id", "product_category_id"],
    },
    role_map={
        "order": "public.order",
        "line": "public.order_item",
        "product": "public.product",
        "category": "public.product_category",
        "product_category_join": "public.product_category_product",
    },
)

# Medusa v2 two-hop layout: order_item is the link, order_line_item holds the products.
INFO_V2 = SchemaInfo(
    tables={
        "public.order": ["id", "customer_id", "status"],
        "public.order_item": ["id", "order_id", "item_id", "quantity", "unit_price"],
        "public.order_line_item": ["id", "product_id", "title", "quantity", "unit_price"],
        "public.product": ["id", "title", "handle", "thumbnail"],
    },
    role_map={
        "order": "public.order",
        "line": "public.order_line_item",
        "order_item_link": "public.order_item",
        "product": "public.product",
    },
)


class AliasTest(unittest.TestCase):
    def test_pick_returns_real_column_case_insensitively(self):
        cols = ["ID", "Title", "Thumbnail_URL"]
        self.assertEqual(_pick(cols, ("id",)), "ID")
        self.assertEqual(_pick(cols, ("title", "name")), "Title")
        self.assertEqual(_pick(cols, ("thumbnail", "thumbnail_url")), "Thumbnail_URL")
        self.assertIsNone(_pick(cols, ("nope",)))


class FetchCatalogTest(unittest.TestCase):
    def test_catalog_with_categories(self):
        class SeqDriver:
            """Returns a different preset list for each successive query()."""
            def __init__(self):
                self.n = 0
                self.seqs = [
                    [{"product_id": "p1", "product_category_id": "c1"}],
                    [{"id": "c1", "name": "Ceramics"}],
                    [{"id": "p1", "title": "Handmade pot", "handle": "pot", "thumbnail": "t.png"}],
                ]

            def query(self, sql, params=()):
                out = self.seqs[self.n] if self.n < len(self.seqs) else []
                self.n += 1
                return out

        items = fetch_catalog(Config(), INFO, SeqDriver())
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].product_id, "p1")
        self.assertEqual(items[0].title, "Handmade pot")
        self.assertEqual(items[0].handle, "pot")
        self.assertEqual(items[0].meta["categories"], "Ceramics")

    def test_catalog_returns_empty_without_product_role(self):
        info = SchemaInfo(tables={}, role_map={})
        self.assertEqual(fetch_catalog(Config(), info, FakeDriver([])), [])


class FetchPurchasesSingleTableTest(unittest.TestCase):
    def test_purchases_weight_from_quantity(self):
        drv = FakeDriver([
            {"_oid": "o1", "_pid": "p1", "_cid": "c1", "_qty": 3, "_amount": 9.9},
            {"_oid": "o2", "_pid": "p2", "_cid": "c2", "_qty": None, "_amount": 5.0},
        ])
        out = fetch_purchases(Config(), INFO, drv)
        self.assertEqual(len(out), 2)
        self.assertEqual(out[0].customer_id, "c1")
        self.assertEqual(out[0].product_id, "p1")
        self.assertEqual(out[0].weight, 3.0)
        self.assertEqual(out[1].weight, 1.0)   # NULL quantity falls back to 1.0

    def test_purchases_skip_empty_ids(self):
        drv = FakeDriver([
            {"_oid": "o1", "_pid": "p1", "_cid": ""},   # empty customer -> dropped
            {"_oid": "o2", "_pid": "", "_cid": "c2"},   # empty product  -> dropped
        ])
        self.assertEqual(fetch_purchases(Config(), INFO, drv), [])

    def test_missing_line_role_raises(self):
        info = SchemaInfo(tables={}, role_map={})
        with self.assertRaises(RuntimeError):
            fetch_purchases(Config(), info, FakeDriver([]))


class FetchPurchasesTwoHopTest(unittest.TestCase):
    def test_purchases_join_through_order_item_link(self):
        class CapturingDriver:
            def __init__(self):
                self.sql = None

            def query(self, sql, params=()):
                self.sql = sql
                return [{"_cid": "c1", "_pid": "p1", "_oid": "l1", "_qty": 2, "_amount": 9.0}]

        drv = CapturingDriver()
        out = fetch_purchases(Config(), INFO_V2, drv)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0].customer_id, "c1")
        self.assertEqual(out[0].product_id, "p1")
        self.assertEqual(out[0].weight, 2.0)
        # The generated SQL must traverse the link table, not treat the line table as the link.
        self.assertIn("order_item", drv.sql)
        self.assertIn("order_line_item", drv.sql)
        self.assertIn("JOIN", drv.sql)

    def test_two_hop_without_link_role_raises(self):
        info = SchemaInfo(
            tables={"public.order": ["id", "customer_id"],
                    "public.order_line_item": ["id", "product_id"]},
            role_map={"order": "public.order", "line": "public.order_line_item"},
        )
        with self.assertRaises(RuntimeError):
            fetch_purchases(Config(), info, FakeDriver([]))


class ApplyViewsTest(unittest.TestCase):
    def test_views_merged_with_lower_weight_and_dedup(self):
        purchases = [Interaction("c1", "p1", weight=2.0)]
        views = [Interaction("c1", "p1", weight=1.0),   # duplicate of a purchase -> dropped
                 Interaction("c1", "p2", weight=1.0)]   # new contact -> merged at lower weight
        merged = apply_views(Config(view_weight=0.5), views, purchases)
        self.assertEqual(len(merged), 2)
        p2 = [i for i in merged if i.product_id == "p2"][0]
        self.assertAlmostEqual(p2.weight, 0.5)


if __name__ == "__main__":
    unittest.main()
