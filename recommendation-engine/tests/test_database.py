"""Unit tests for database.py: role resolution (aliases, missing columns, override) and describe()."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from recommender.config import Config  # noqa: E402
from recommender.database import SchemaInfo, describe, resolve_roles  # noqa: E402


def resolve(tables, override=None):
    cfg = Config(role_override=override or {})
    return resolve_roles(cfg, SchemaInfo(tables=dict(tables)))


class RoleResolveTest(unittest.TestCase):
    def test_standard_medusa_schema(self):
        info = resolve({
            "public.order": ["id", "customer_id", "status", "currency_code"],
            "public.order_item": ["id", "order_id", "product_id", "quantity"],
            "public.product": ["id", "title", "handle", "status"],
            "public.product_category": ["id", "name", "handle"],
            "public.product_category_product": ["product_id", "product_category_id"],
            "public.customer": ["id", "email"],
        })
        self.assertEqual(info.role_map["order"], "public.order")
        self.assertEqual(info.role_map["line"], "public.order_item")
        self.assertEqual(info.role_map["product"], "public.product")
        self.assertEqual(info.role_map["customer"], "public.customer")
        self.assertEqual(info.role_map["category"], "public.product_category")
        self.assertEqual(info.role_map["product_category_join"], "public.product_category_product")

    def test_medusa_v2_two_hop_layout_with_review_decoy(self):
        # Real Medusa v2 layout: order_line_item has product_id but no order_id; the link
        # table order_item (order_id + item_id) connects them. product_review is a decoy
        # because it happens to carry both order_id and product_id.
        info = resolve({
            "public.order": ["id", "customer_id", "status"],
            "public.order_item": ["id", "order_id", "item_id", "quantity"],
            "public.order_line_item": ["id", "product_id", "title", "quantity"],
            "public.product_review": ["id", "order_id", "product_id", "rating"],
            "public.product": ["id", "title", "handle"],
            "public.customer": ["id", "email"],
        })
        self.assertEqual(info.role_map["line"], "public.order_line_item")   # not product_review
        self.assertEqual(info.role_map["order_item_link"], "public.order_item")
        self.assertEqual(info.role_map["order"], "public.order")

    def test_order_without_status_still_resolves(self):
        info = resolve({
            "public.orders": ["id", "customer_id", "total"],   # no status column
            "public.line": ["order_id", "product_id", "qty"],
            "public.product": ["id", "name", "slug"],           # uses name/slug
            "public.customer": ["id"],
        })
        self.assertEqual(info.role_map["order"], "public.orders")
        self.assertEqual(info.role_map["line"], "public.line")
        self.assertEqual(info.role_map["product"], "public.product")

    def test_customer_id_alias_user_id(self):
        info = resolve({
            "public.orders": ["id", "user_id"],                 # buyer column named user_id
            "public.order_item": ["order_id", "product_id"],
            "public.product": ["id", "title"],
        })
        self.assertEqual(info.role_map["order"], "public.orders")

    def test_override_wins(self):
        info = resolve({
            "public.order": ["id", "customer_id"],
            "public.order_item": ["order_id", "product_id"],
            "public.product": ["id", "title"],
            "public.my_lines": ["order_id", "product_id"],
        }, override={"line": "public.my_lines"})
        self.assertEqual(info.role_map["line"], "public.my_lines")

    def test_missing_when_absent(self):
        info = resolve({"public.whatever": ["a", "b"]})
        self.assertIn("order", info.missing)
        self.assertIn("line", info.missing)

    def test_schema_info_helpers(self):
        info = SchemaInfo(tables={"public.product": ["id", "title"]},
                          role_map={"product": "public.product"})
        self.assertEqual(info.short("product"), "product")
        self.assertEqual(info.cols_for("product"), ["id", "title"])
        self.assertIn("public.product", describe(info))


if __name__ == "__main__":
    unittest.main()
