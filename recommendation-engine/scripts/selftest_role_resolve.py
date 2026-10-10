"""Self-test: does resolve_roles pick the right tables for several simulated schemas?

Run before touching a real database to sanity-check the role-resolution logic
(no database required; purely in-memory fake schemas).
Usage: python scripts/selftest_role_resolve.py
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Dict, List, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from recommender.config import Config  # noqa: E402
from recommender.database import SchemaInfo, resolve_roles  # noqa: E402


def check(name: str, tables: Dict[str, List[str]], expect: Dict[str, str]) -> bool:
    info = resolve_roles(Config(), SchemaInfo(tables=dict(tables)))
    ok = True
    problems = []
    for role, want in expect.items():
        got = info.role_map.get(role)
        if got != want:
            ok = False
            problems.append(f"{role}: expected {want}, got {got}")
    print(f"[{'PASS' if ok else 'FAIL'}] {name}")
    for role in expect:
        print(f"    {role:22s} -> {info.role_map.get(role)}")
    if problems:
        print("    problems: " + "; ".join(problems))
    return ok


CASES: List[Tuple[str, Dict[str, List[str]], Dict[str, str]]] = [
    (
        "standard Medusa tables (pivot column product_category_id)",
        {
            "public.order": ["id", "customer_id", "status", "currency_code"],
            "public.order_item": ["id", "order_id", "product_id", "quantity", "unit_price"],
            "public.product": ["id", "title", "handle", "status", "thumbnail"],
            "public.product_category": ["id", "name", "handle"],
            "public.product_category_product": ["product_id", "product_category_id"],
            "public.customer": ["id", "email"],
        },
        {
            "order": "public.order",
            "line": "public.order_item",
            "product": "public.product",
            "customer": "public.customer",
            "category": "public.product_category",
            "product_category_join": "public.product_category_product",
        },
    ),
    (
        "order without status, product using name/slug, line table named line",
        {
            "public.orders": ["id", "customer_id", "total"],
            "public.line": ["order_id", "product_id", "qty"],
            "public.product": ["id", "name", "slug"],
            "public.customer": ["id"],
        },
        {
            "order": "public.orders",
            "line": "public.line",
            "product": "public.product",
            "customer": "public.customer",
        },
    ),
    (
        "Medusa v2 two-hop layout, with product_review as a decoy table",
        {
            "public.order": ["id", "customer_id", "status"],
            "public.order_item": ["id", "order_id", "item_id", "quantity"],          # link
            "public.order_line_item": ["id", "product_id", "title", "quantity"],     # real lines
            "public.product_review": ["id", "order_id", "product_id", "rating"],     # decoy!
            "public.product": ["id", "title", "handle"],
            "public.product_category": ["id", "name"],
            "public.product_category_product": ["product_id", "product_category_id"],
            "public.customer": ["id", "email"],
        },
        {
            "order": "public.order",
            "line": "public.order_line_item",          # must not be product_review
            "order_item_link": "public.order_item",
            "product": "public.product",
            "customer": "public.customer",
        },
    ),
]


def main() -> int:
    results = [check(*c) for c in CASES]
    print(f"\n{sum(results)}/{len(results)} cases passed")
    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
