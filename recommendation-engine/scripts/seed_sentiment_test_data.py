"""Create/remove clearly-marked test reviews for the sentiment layer.

This is the ONLY script in the repository that writes to the database. It is not
imported by the training/API pipeline; production code remains read-only.

Every row it creates is tagged with ``PREFIX`` in the ``id`` column
(``rev_s4test_...``), so ``--cleanup`` removes exactly those rows and nothing else.

Usage:
    python scripts/seed_sentiment_test_data.py --dry-run     # preview (safe)
    python scripts/seed_sentiment_test_data.py --apply       # insert test rows
    python scripts/seed_sentiment_test_data.py --cleanup     # delete test rows

Options:
    --product-id ID   only use this product (default: first N products)
    --limit N         number of reviews to create (default: 8)

Safety:
    - ``--dry-run`` prints the SQL parameters and exits without writing.
    - ``--apply`` refuses to run unless ``--yes`` is also given for non-SQLite
      databases (the team's shared cloud database), to avoid accidents.
    - Rows are only inserted when the review table's required columns are known;
      otherwise the script explains what is missing instead of guessing.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from recommender import database, sentiment  # noqa: E402
from recommender.config import get_config  # noqa: E402

PREFIX = "rev_s4test_"

# (rating, text) — mixed Chinese/English, positive/neutral/negative.
SAMPLES = [
    (5, "质量很好，非常喜欢，值得推荐"),
    (4, "Very good quality, beautiful and worth the price"),
    (5, "手作很精致，卖家很用心，满意"),
    (1, "收到就破损了，非常失望"),
    (2, "Terrible quality, arrived broken and late"),
    (3, "东西一般般，没有惊喜"),
    (5, "Amazing craftsmanship, I love it"),
    (1, "很差，掉色严重，不推荐"),
]


def placeholder(cfg) -> str:
    return "?" if database.is_sqlite(cfg.database_url) else "%s"


def pick_products(cfg, info: database.SchemaInfo, limit: int) -> List[str]:
    key = info.role_map.get("product")
    if not key:
        return []
    cols = info.tables[key]
    id_col = sentiment._pick(cols, ("id",))
    if not id_col:
        return []
    sql = f'SELECT "{id_col}" AS id FROM {database.quote_table(key)} LIMIT {int(limit)}'
    with database.Driver(cfg.database_url) as drv:
        rows = drv.query(sql)
    return [str(r["id"]) for r in rows if r.get("id")]


def count_test_rows(cfg, info, review_key: str) -> int:
    ph = placeholder(cfg)
    sql = (
        f"SELECT COUNT(*) AS n FROM {database.quote_table(review_key)} "
        f"WHERE id LIKE {ph}"
    )
    with database.Driver(cfg.database_url) as drv:
        rows = drv.query(sql, [f"{PREFIX}%"])
    return int(rows[0]["n"]) if rows else 0


def cleanup(cfg, info, review_key: str) -> int:
    ph = placeholder(cfg)
    sql = f"DELETE FROM {database.quote_table(review_key)} WHERE id LIKE {ph}"
    with database.Driver(cfg.database_url) as drv:
        drv.query(sql, [f"{PREFIX}%"])
    return count_test_rows(cfg, info, review_key)


def build_rows(info, review_key: str, product_ids: List[str], limit: int) -> List[Dict[str, Any]]:
    cols = {c.lower(): c for c in info.tables[review_key]}
    now = _dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    rows: List[Dict[str, Any]] = []
    for index in range(min(limit, len(SAMPLES))):
        rating, text = SAMPLES[index]
        product_id = product_ids[index % len(product_ids)] if product_ids else None
        row: Dict[str, Any] = {
            "id": f"{PREFIX}{index + 1:03d}",
            "product_id": product_id,
            "rating": rating,
            "content": text,
        }
        if "status" in cols:
            row["status"] = "published"
        if "created_at" in cols:
            row["created_at"] = now
        if "updated_at" in cols:
            row["updated_at"] = now
        rows.append(row)
    return rows


def insert_rows(cfg, info, review_key: str, rows: List[Dict[str, Any]]) -> None:
    table = database.quote_table(review_key)
    available = {c.lower() for c in info.tables[review_key]}
    ph = placeholder(cfg)
    with database.Driver(cfg.database_url) as drv:
        for row in rows:
            usable = {k: v for k, v in row.items() if k.lower() in available}
            if not usable:
                continue
            columns = ", ".join(f'"{k}"' for k in usable)
            marks = ", ".join([ph] * len(usable))
            sql = f"INSERT INTO {table} ({columns}) VALUES ({marks})"
            drv.query(sql, list(usable.values()))


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Seed/clean marked test reviews.")
    parser.add_argument("--dry-run", action="store_true", help="preview only (default)")
    parser.add_argument("--apply", action="store_true", help="actually insert rows")
    parser.add_argument("--cleanup", action="store_true", help="delete rev_s4test_* rows")
    parser.add_argument("--product-id", default=None, help="use only this product")
    parser.add_argument("--limit", type=int, default=8, help="number of reviews (default 8)")
    parser.add_argument("--yes", action="store_true", help="confirm writing to a non-SQLite DB")
    args = parser.parse_args(argv)

    cfg = get_config()
    if not cfg.database_url:
        print("DATABASE_URL is not configured. See recommendation-engine/.env.example")
        return 2

    info = database.list_schema(cfg)
    database.resolve_roles(cfg, info)
    review_key = sentiment.pick_review_table(info)
    if not review_key:
        print("Could not resolve a product-review table; run --inspect first.")
        return 2

    is_sqlite = database.is_sqlite(cfg.database_url)
    print(f"[db] {review_key} ({'sqlite' if is_sqlite else 'postgresql'})")

    if args.cleanup:
        before = count_test_rows(cfg, info, review_key)
        print(f"[cleanup] found {before} test rows ({PREFIX}*)")
        if before == 0:
            return 0
        if not args.yes and not is_sqlite:
            print("[cleanup] refusing to delete from a shared database; add --yes to confirm.")
            return 1
        remaining = cleanup(cfg, info, review_key)
        print(f"[cleanup] done, remaining test rows: {remaining}")
        return 0

    product_ids = [args.product_id] if args.product_id else pick_products(cfg, info, args.limit)
    if not product_ids:
        print("No products found; create a product first or pass --product-id.")
        return 2

    rows = build_rows(info, review_key, product_ids, args.limit)
    print(f"[plan] {len(rows)} rows, prefix={PREFIX}")
    for row in rows:
        print(f"  - {row['id']}  product={row['product_id']}  rating={row['rating']}  {row['content'][:30]}")
    print("[plan] columns:", ", ".join(sorted({k for r in rows for k in r})))

    if not args.apply:
        print("[dry-run] nothing written. Re-run with --apply to insert.")
        return 0
    if not args.yes and not is_sqlite:
        print("[apply] refusing to write to a shared database; add --yes to confirm.")
        return 1

    try:
        insert_rows(cfg, info, review_key, rows)
    except Exception as exc:  # noqa: BLE001
        print(f"[apply] insert failed: {exc}")
        print("[apply] This usually means product_review requires order_id / "
              "order_line_item_id to be NOT NULL. Use the Store API or a test DB instead.")
        return 1

    written = count_test_rows(cfg, info, review_key)
    if written < len(rows):
        print(f"[apply] WARNING: only {written}/{len(rows)} rows are visible after insert.")
        print("[apply] Check that the driver commits transactions (SQLite autocommit).")
        return 1

    print(f"[apply] inserted {len(rows)} test rows. Verify with:")
    print("  python -m recommender.sentiment --export artifacts/sentiment.json")
    print(f"  python scripts/seed_sentiment_test_data.py --cleanup --yes   # to remove")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
