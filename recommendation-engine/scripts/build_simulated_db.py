"""Build a single-file simulated database (SQLite) mimicking a real marketplace.

Purpose: while the cloud (Railway) database has no real data yet, this reproduces a
Medusa-style schema plus realistic user behaviour locally, so the whole recommender
pipeline (--inspect / training / evaluation) can be exercised end to end.

Usage:
  python scripts/build_simulated_db.py [out.db] [n_users] [n_products] [seed]
Default output: <repo>/simulated_marketplace.db (a single file).

Tables (Medusa-style):
  store / product / product_category / product_category_product /
  customer / "order" / order_item

Realistic data characteristics (not uniform random):
  - products spread across handmade categories
  - each user has 1~3 preferred categories; most purchases come from them, with a little
    random exploration
  - 1~10 orders per user, 1~3 items per order; occasional repeat purchases (quantity > 1)
  - ~6% cancelled orders (to verify status filtering excludes them)
This gives collaborative and content models a learnable "preference + noise" structure.
"""
from __future__ import annotations

import random
import sqlite3
import sys
from pathlib import Path

DDL = """
CREATE TABLE store (
    id TEXT PRIMARY KEY, name TEXT
);
CREATE TABLE product (
    id TEXT PRIMARY KEY, title TEXT, handle TEXT, status TEXT,
    thumbnail TEXT, store_id TEXT
);
CREATE TABLE product_category (
    id TEXT PRIMARY KEY, name TEXT, handle TEXT
);
CREATE TABLE product_category_product (
    product_id TEXT, product_category_id TEXT,
    PRIMARY KEY (product_id, product_category_id)
);
CREATE TABLE customer (
    id TEXT PRIMARY KEY, email TEXT, created_at TEXT
);
CREATE TABLE "order" (
    id TEXT PRIMARY KEY, display_id INTEGER, customer_id TEXT,
    status TEXT, currency_code TEXT, created_at TEXT, total REAL
);
CREATE TABLE order_item (
    id TEXT PRIMARY KEY, order_id TEXT, product_id TEXT,
    quantity INTEGER, unit_price REAL, title TEXT
);
"""

# Category display names stay in Chinese on purpose: the marketplace targets China.
CATEGORIES = [
    ("cat_ceramic", "陶瓷", "ceramic"),
    ("cat_textile", "布艺", "textile"),
    ("cat_wood", "木作", "wood"),
    ("cat_aroma", "香薰", "aroma"),
    ("cat_leather", "皮具", "leather"),
    ("cat_rattan", "藤编", "rattan"),
]


def build(out: Path, n_users: int, n_products: int, seed: int) -> None:
    rng = random.Random(seed)
    if out.exists():
        out.unlink()
    conn = sqlite3.connect(str(out))
    try:
        conn.executescript(DDL)
        conn.execute("INSERT INTO store VALUES (?,?)", ("store_1", "Handmade Collective"))
        conn.executemany("INSERT INTO product_category VALUES (?,?,?)", CATEGORIES)

        # Products: distribute round-robin across categories.
        products = []
        for i in range(n_products):
            cid, cname, chandle = CATEGORIES[i % len(CATEGORIES)]
            products.append((f"prod_{i:04d}", f"{cname}手作 {i:03d}", f"{chandle}-{i:03d}", cid))
        title_by_pid = {pid: title for (pid, title, _h, _c) in products}

        conn.executemany(
            "INSERT INTO product (id,title,handle,status,thumbnail,store_id) VALUES (?,?,?,?,?,?)",
            [(pid, title, handle, "published", f"https://img.local/{pid}.png", "store_1")
             for (pid, title, handle, _cid) in products],
        )
        conn.executemany(
            "INSERT INTO product_category_product (product_id,product_category_id) VALUES (?,?)",
            [(pid, cid) for (pid, _t, _h, cid) in products],
        )

        users = [f"cus_{u:05d}" for u in range(n_users)]
        conn.executemany(
            "INSERT INTO customer (id,email,created_at) VALUES (?,?,?)",
            [(u, f"{u}@example.com", "2025-01-01T00:00:00Z") for u in users],
        )

        by_cat: dict = {}
        for pid, _t, _h, cid in products:
            by_cat.setdefault(cid, []).append(pid)
        cat_ids = [c[0] for c in CATEGORIES]
        all_pids = [p[0] for p in products]

        order_seq = item_seq = n_orders = n_canceled = 0
        for u in users:
            pref = rng.sample(cat_ids, rng.choice([1, 2, 2, 2, 3]))
            for _ in range(rng.randint(1, 10)):
                order_seq += 1
                oid = f"order_{order_seq:06d}"
                canceled = rng.random() < 0.06
                status = "canceled" if canceled else rng.choice(["completed", "pending", "completed"])
                n_canceled += int(canceled)
                created = f"2025-{rng.randint(1, 12):02d}-{rng.randint(1, 28):02d}T12:00:00Z"

                chosen = []
                for _ in range(rng.randint(1, 3)):
                    if rng.random() < 0.85:                       # preferred category
                        pool = by_cat.get(rng.choice(pref)) or all_pids
                    else:                                         # exploratory
                        pool = all_pids
                    chosen.append(rng.choice(pool))

                total = 0.0
                for pid in chosen:
                    item_seq += 1
                    qty = 2 if rng.random() < 0.12 else 1     # occasional repeat purchase
                    price = round(rng.uniform(15, 320), 2)
                    total += price * qty
                    conn.execute(
                        "INSERT INTO order_item (id,order_id,product_id,quantity,unit_price,title)"
                        " VALUES (?,?,?,?,?,?)",
                        (f"item_{item_seq:07d}", oid, pid, qty, price, title_by_pid.get(pid, pid)),
                    )
                conn.execute(
                    'INSERT INTO "order" (id,display_id,customer_id,status,currency_code,'
                    "created_at,total) VALUES (?,?,?,?,?,?,?)",
                    (oid, order_seq, u, status, "sgd", created, round(total, 2)),
                )
                n_orders += 1

        conn.commit()
    finally:
        conn.close()

    print(f"wrote {out}")
    print(f"  products={n_products} categories={len(CATEGORIES)} customers={n_users} "
          f"orders={n_orders} canceled_orders={n_canceled}")


def main(argv) -> int:
    root = Path(__file__).resolve().parent.parent
    out = Path(argv[1]) if len(argv) > 1 else root / "simulated_marketplace.db"
    n_users = int(argv[2]) if len(argv) > 2 else 200
    n_products = int(argv[3]) if len(argv) > 3 else 60
    seed = int(argv[4]) if len(argv) > 4 else 42
    build(out, n_users, n_products, seed)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
