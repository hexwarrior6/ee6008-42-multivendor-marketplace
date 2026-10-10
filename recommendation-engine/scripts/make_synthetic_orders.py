"""Generate a synthetic offline orders CSV to exercise the whole pipeline (incl. LightFM).

Usage:
  python scripts/make_synthetic_orders.py <out.csv> [n_users] [n_products] [seed]
Columns match scripts/sample_orders.csv (customer_id,product_id,title,weight,handle).
Data is randomly synthesised for functional/performance checks only, not real business data.
"""
from __future__ import annotations

import csv
import random
import sys
from pathlib import Path


def main(argv) -> int:
    out = Path(argv[1]) if len(argv) > 1 else Path("out_syn.csv")
    n_users = int(argv[2]) if len(argv) > 2 else 150
    n_items = int(argv[3]) if len(argv) > 3 else 40
    seed = int(argv[4]) if len(argv) > 4 else 42
    rng = random.Random(seed)

    cats = ["陶瓷", "布艺", "木作", "香薰", "皮具", "藤编"]
    products = []
    for i in range(n_items):
        cat = cats[i % len(cats)]
        products.append((f"prod_{i:03d}", f"{cat}手作{i:03d}", f"{cat}-{i:03d}"))

    # Each user prefers 2 categories, creating a learnable collaborative structure.
    user_pref = {u: set(rng.sample(range(len(cats)), 2)) for u in range(n_users)}
    rows = []
    for u in range(n_users):
        pool = [p for idx, p in enumerate(products) if (idx % len(cats)) in user_pref[u]] or products
        n_buy = min(rng.randint(2, 8), len(pool))
        for pid, title, handle in rng.sample(pool, n_buy):
            rows.append((f"cus_{u:04d}", pid, title, 1, handle))

    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["customer_id", "product_id", "title", "weight", "handle"])
        w.writerows(rows)
    print(f"wrote {out} : {len(rows)} interactions / {n_users} users / {n_items} products")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
