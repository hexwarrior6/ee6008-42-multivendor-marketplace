"""End-to-end tests for train.py: argument parsing, offline CSV pipeline, export, error paths.

Everything runs offline (no database) and writes into a temporary directory.
"""
import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from recommender.train import main, parse_models  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLE = os.path.join(os.path.dirname(HERE), "scripts", "sample_orders.csv")


class ParseModelsTest(unittest.TestCase):
    def test_all_expands(self):
        self.assertEqual(parse_models("all"), ["svd", "als", "lightfm"])

    def test_subset_and_whitespace(self):
        self.assertEqual(parse_models("svd, als"), ["svd", "als"])

    def test_unknown_filtered(self):
        self.assertEqual(parse_models("svd,bogus"), ["svd"])


class EndToEndTest(unittest.TestCase):
    def setUp(self):
        # Do not let a local .env leak into these tests.
        self._dotenv_patch = mock.patch("recommender.config._load_dotenv", lambda *a, **k: None)
        self._dotenv_patch.start()
        self.addCleanup(self._dotenv_patch.stop)

    def test_offline_pipeline_runs_and_exports(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, "recs.json")
            with mock.patch.dict(os.environ, {}, clear=True), contextlib.redirect_stdout(io.StringIO()):
                rc = main(["--offline-rows", SAMPLE, "--models", "svd,als",
                           "--export", out])
            self.assertEqual(rc, 0)
            self.assertTrue(os.path.exists(out))
            with open(out, encoding="utf-8") as fh:
                data = json.load(fh)
        for key in ("by_user", "by_product", "fallback", "source", "model_version"):
            self.assertIn(key, data)
        self.assertTrue(data["by_product"])           # content similarity always present

    def test_inspect_without_database_raises(self):
        with mock.patch.dict(os.environ, {}, clear=True), contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(RuntimeError):
                main(["--inspect"])

    def test_missing_offline_file_raises(self):
        with mock.patch.dict(os.environ, {}, clear=True), contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises((OSError, SystemExit)):
                main(["--offline-rows", os.path.join(HERE, "nope.csv"), "--models", "svd"])


if __name__ == "__main__":
    unittest.main()
