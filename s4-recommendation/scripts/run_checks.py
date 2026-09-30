"""CI-friendly self-check: run the unit tests plus an offline pipeline smoke test.

Usage:
  python scripts/run_checks.py
Exit code: 0 = all passed, 1 = something failed. Ready for S5 to wire into CI/CD.
"""
from __future__ import annotations

import contextlib
import io
import os
import sys
import tempfile
import unittest
import warnings
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT))


def run_unit_tests() -> bool:
    suite = unittest.TestLoader().discover(str(ROOT / "tests"), top_level_dir=str(ROOT))
    result = unittest.TextTestRunner(verbosity=2, buffer=True).run(suite)
    return result.wasSuccessful()


def run_offline_smoke() -> bool:
    """Run the offline CSV pipeline end to end (clean -> train -> evaluate -> export)."""
    from recommender.train import main

    sample = ROOT / "scripts" / "sample_orders.csv"
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "recs.json")
        with contextlib.redirect_stdout(io.StringIO()):
            rc = main(["--offline-rows", str(sample), "--models", "svd,als", "--export", out])
        ok = rc == 0 and os.path.exists(out)
    print(f"[smoke] offline pipeline: {'OK' if ok else 'FAIL'}")
    return ok


def main() -> int:
    warnings.filterwarnings("ignore")   # e.g. LightFM's "compiled without OpenMP" notice
    print("=" * 60)
    print("1) unit tests")
    tests_ok = run_unit_tests()
    print("=" * 60)
    print("2) offline pipeline smoke")
    smoke_ok = run_offline_smoke()
    print("=" * 60)
    ok = tests_ok and smoke_ok
    print(f"RESULT: {'PASS' if ok else 'FAIL'} (unit={tests_ok}, smoke={smoke_ok})")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
