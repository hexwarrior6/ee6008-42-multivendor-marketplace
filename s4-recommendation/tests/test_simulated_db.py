"""End-to-end tests on the simulated SQLite DB: helpers, introspection -> roles ->
loading -> training/evaluation, plus the offline pipeline in test_train.

No external database is needed: a small DB is generated in a temp dir.
"""
import contextlib
import importlib.util
import io
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from recommender.config import Config  # noqa: E402
from recommender.data_loader import fetch_catalog, fetch_purchases  # noqa: E402
from recommender.database import (  # noqa: E402
    Driver,
    is_sqlite,
    list_schema,
    quote_table,
    resolve_roles,
    sqlite_path,
)

ROOT = Path(__file__).resolve().parent.parent


def _load_builder():
    spec = importlib.util.spec_from_file_location(
        "build_simulated_db", str(ROOT / "scripts" / "build_simulated_db.py"))
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


class SqliteHelpersTest(unittest.TestCase):
    def test_is_sqlite(self):
        self.assertTrue(is_sqlite("sqlite:///x/y.db"))
        self.assertFalse(is_sqlite("postgresql://h:5432/db"))
        self.assertFalse(is_sqlite(None))

    def test_sqlite_path(self):
        self.assertEqual(sqlite_path("sqlite:///E:/a/b.db"), "E:/a/b.db")

    def test_quote_table_handles_reserved_words(self):
        self.assertEqual(quote_table("main.order"), '"main"."order"')
        self.assertEqual(quote_table("public.order_item"), '"public"."order_item"')


class SimulatedDbTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.builder = _load_builder()
        cls.tmp = tempfile.TemporaryDirectory()
        cls.db_path = os.path.join(cls.tmp.name, "sim.db")
        cls.builder.build(Path(cls.db_path), n_users=30, n_products=12, seed=1)
        cls.url = "sqlite:///" + cls.db_path.replace("\\", "/")
        cls.cfg = Config(database_url=cls.url)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_schema_and_roles_resolve(self):
        info = resolve_roles(self.cfg, list_schema(self.cfg))
        self.assertEqual(info.role_map["order"], "main.order")
        self.assertEqual(info.role_map["line"], "main.order_item")
        self.assertEqual(info.role_map["product"], "main.product")
        self.assertEqual(info.role_map["customer"], "main.customer")
        self.assertEqual(info.role_map["category"], "main.product_category")
        self.assertEqual(info.role_map["product_category_join"], "main.product_category_product")

    def test_fetch_catalog_and_purchases(self):
        info = resolve_roles(self.cfg, list_schema(self.cfg))
        with Driver(self.url) as drv:
            catalog = fetch_catalog(self.cfg, info, drv)
            purchases = fetch_purchases(self.cfg, info, drv)
        self.assertEqual(len(catalog), 12)
        self.assertTrue(all(c.title for c in catalog))
        self.assertTrue(any(c.meta.get("categories") for c in catalog))
        self.assertGreater(len(purchases), 0)
        self.assertTrue(all(p.customer_id and p.product_id for p in purchases))

    def test_canceled_orders_are_filtered(self):
        # The generator emits ~6% cancelled orders; confirm they are excluded.
        info = resolve_roles(self.cfg, list_schema(self.cfg))
        with Driver(self.url) as drv:
            total = drv.query('SELECT COUNT(*) AS n FROM "main"."order_item"')[0]["n"]
            kept = drv.query(
                'SELECT COUNT(*) AS n FROM "main"."order_item" i '
                'JOIN "main"."order" o ON o."id" = i."order_id" '
                "WHERE COALESCE(o.\"status\",'') NOT IN ('canceled','cancelled')"
            )[0]["n"]
            purchases = fetch_purchases(self.cfg, info, drv)
        self.assertLess(kept, total)                 # some rows are indeed dropped
        self.assertEqual(len(purchases), kept)       # fetch_purchases matches the filter

    def test_end_to_end_train_on_simulated_db(self):
        from recommender import train as tra

        out = os.path.join(self.tmp.name, "recs.json")
        with mock.patch.dict(os.environ, {"DATABASE_URL": self.url}, clear=True), \
                contextlib.redirect_stdout(io.StringIO()):
            rc = tra.main(["--models", "svd", "--export", out])
        self.assertEqual(rc, 0)
        self.assertTrue(os.path.exists(out))


if __name__ == "__main__":
    unittest.main()
