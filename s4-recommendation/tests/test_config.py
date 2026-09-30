"""Unit tests for config.py: env/.env parsing, DB_ROLE_OVERRIDE, numeric fallbacks."""
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from recommender.config import Config, _load_dotenv, get_config  # noqa: E402


class ConfigTest(unittest.TestCase):
    def setUp(self):
        # Tests must not depend on a real .env in the working directory.
        self._dotenv_patch = mock.patch("recommender.config._load_dotenv", lambda *a, **k: None)
        self._dotenv_patch.start()
        self.addCleanup(self._dotenv_patch.stop)

    def test_database_url_from_env(self):
        with mock.patch.dict(os.environ, {"DATABASE_URL": "postgresql://u:p@h:5432/d"}, clear=True):
            cfg = get_config()
        self.assertEqual(cfg.database_url, "postgresql://u:p@h:5432/d")

    def test_database_url_assembled_from_pg_parts(self):
        env = {"PGDATABASE": "medusa", "PGUSER": "medusa", "PGHOST": "localhost"}
        with mock.patch.dict(os.environ, env, clear=True):
            cfg = get_config()
        self.assertEqual(cfg.database_url, "postgresql://medusa:medusa@localhost:5432/medusa")

    def test_role_override_parsed(self):
        env = {"DB_ROLE_OVERRIDE": '{"order":"public.order","line":"public.order_item"}'}
        with mock.patch.dict(os.environ, env, clear=True):
            cfg = get_config()
        self.assertEqual(cfg.role_override["order"], "public.order")
        self.assertEqual(cfg.role_override["line"], "public.order_item")

    def test_role_override_invalid_json_ignored(self):
        with mock.patch.dict(os.environ, {"DB_ROLE_OVERRIDE": "not-json"}, clear=True):
            cfg = get_config()
        self.assertEqual(cfg.role_override, {})

    def test_numeric_env_parsing_and_fallback(self):
        env = {"FACTORS": "48", "K": "5", "ITERS": "abc"}
        with mock.patch.dict(os.environ, env, clear=True):
            cfg = get_config()
        self.assertEqual(cfg.factors, 48)   # parsed normally
        self.assertEqual(cfg.k, 5)
        self.assertEqual(cfg.iters, 15)     # invalid value falls back to default
        self.assertAlmostEqual(cfg.view_weight, 0.5)

    def test_defaults_without_env(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            cfg = get_config()
        self.assertIsNone(cfg.database_url)
        self.assertEqual((cfg.factors, cfg.iters, cfg.k), (32, 15, 8))

    def test_ensure_out_dir_creates_dir(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = Config(out_dir=os.path.join(tmp, "a", "b"))
            p = cfg.ensure_out_dir()
            self.assertTrue(p.is_dir())


class DotenvTest(unittest.TestCase):
    """_load_dotenv semantics: minimal parsing, quotes stripped, real env wins, no interpolation."""

    def test_load_dotenv_fills_only_unset_variables(self):
        with tempfile.TemporaryDirectory() as tmp:
            envfile = Path(tmp) / ".env"
            envfile.write_text(
                "# a comment\n"
                "OUT_DIR=from-dotenv\n"
                'K="7"\n'
                "INTERPOLATED=postgresql://u:${PASS}@h/db\n"   # not expanded on purpose
                "EXISTING=from-dotenv\n"
                "\n"
                "not-a-key-line\n",
                encoding="utf-8",
            )
            with mock.patch.dict(os.environ, {"EXISTING": "from-real-env"}, clear=True):
                _load_dotenv(str(envfile))
                self.assertEqual(os.environ["OUT_DIR"], "from-dotenv")
                self.assertEqual(os.environ["K"], "7")                          # quotes stripped
                self.assertEqual(os.environ["EXISTING"], "from-real-env")       # real env wins
                self.assertEqual(os.environ["INTERPOLATED"], "postgresql://u:${PASS}@h/db")

    def test_load_dotenv_missing_file_is_noop(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            _load_dotenv(os.path.join(tempfile.gettempdir(), "definitely-missing.env"))
            self.assertEqual(os.environ, {})


if __name__ == "__main__":
    unittest.main()
