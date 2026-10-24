"""Build a small SQLite database with product reviews and run the sentiment layer.

Usage:
    python scripts/build_sentiment_demo.py [output_dir]

The default output directory is a temporary directory, so nothing is written into
the repository. Useful for verifying the Week 10 sentiment layer without the
platform database.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from recommender import sentiment  # noqa: E402  (import after sys.path setup)


def build_demo_db(path: Path) -> None:
    """Create a Medusa-review-like table with mixed Chinese/English reviews."""
    if path.exists():
        path.unlink()
    conn = sqlite3.connect(str(path))
    try:
        conn.executescript(
            """
            CREATE TABLE review (
                id TEXT PRIMARY KEY,
                product_id TEXT,
                customer_id TEXT,
                rating INTEGER,
                title TEXT,
                content TEXT,
                status TEXT,
                created_at TEXT
            );
            CREATE TABLE product (
                id TEXT PRIMARY KEY,
                title TEXT,
                store_id TEXT
            );
            """
        )
        rows = [
            ("r1", "prod_pottery", "cus_1", 5, "Great",
             "Really beautiful and great quality, I love it", "published", "2026-10-01"),
            ("r2", "prod_pottery", "cus_2", 4, "Nice",
             "Very good, worth the price", "published", "2026-10-02"),
            ("r3", "prod_pottery", "cus_3", 1, "Bad",
             "Arrived broken and terrible quality", "published", "2026-10-03"),
            ("r4", "prod_scarf", "cus_1", 5, "很好",
             "质量很好，非常喜欢，值得推荐", "published", "2026-10-04"),
            ("r5", "prod_scarf", "cus_2", 2, "差",
             "质量很差，收到就破损了，非常失望", "published", "2026-10-05"),
            ("r6", "prod_candle", "cus_3", 3, "一般",
             "东西一般般", "published", "2026-10-06"),
            ("r7", "prod_candle", "cus_4", 5, "Spam",
             "buy now cheap", "spam", "2026-10-07"),
        ]
        conn.executemany("INSERT INTO review VALUES (?,?,?,?,?,?,?,?)", rows)
        conn.executemany(
            "INSERT INTO product VALUES (?,?,?)",
            [
                ("prod_pottery", "手工陶艺", "store_ceramic"),
                ("prod_scarf", "手织围巾", "store_textile"),
                ("prod_candle", "香薰蜡烛", "store_aroma"),
            ],
        )
        conn.commit()
    finally:
        conn.close()


def main(argv) -> int:
    out_dir = Path(argv[1]) if len(argv) > 1 else Path(
        tempfile.mkdtemp(prefix="s4-sentiment-")
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    db = out_dir / "sentiment_demo.db"
    build_demo_db(db)

    # Point the existing configuration layer at the demo database.
    os.environ["DATABASE_URL"] = f"sqlite:///{db.as_posix()}"



    export = out_dir / "sentiment.json"
    rc = sentiment.main(["--export", str(export)])
    if rc == 0:
        print(f"demo db : {db}")
        print(f"report  : {export}")
        report = json.loads(export.read_text(encoding="utf-8"))
        print("overall :", json.dumps(report["overall"], ensure_ascii=False))
        print("by_store:", json.dumps(report["by_store"], ensure_ascii=False))
    return rc


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
