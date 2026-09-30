"""PostgreSQL / SQLite access, table introspection and automatic role resolution.

Two data-source flavours share the same role-resolution logic:
  - PostgreSQL (Railway / local): psycopg or psycopg2, introspecting information_schema;
  - SQLite single-file DB (local simulation / CI): stdlib sqlite3, introspecting
    sqlite_master + PRAGMA.

Both produce table names in "schema.table" form (SQLite uses `main.<table>`), and every
table name is quoted through `quote_table()` so reserved words (e.g. PostgreSQL `order`)
are safe in generated SQL.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence

from .config import Config

# Schemas outside the business database; skipped during introspection.
_IGNORED_SCHEMAS = ("pg_catalog", "information_schema", "topology", "tiger", "tiger_data")
_SQLITE_PREFIXES = ("sqlite:///", "sqlite://", "sqlite:")


def is_sqlite(url: Optional[str]) -> bool:
    """True when DATABASE_URL points at SQLite (e.g. sqlite:///path/to.db)."""
    return bool(url) and str(url).startswith("sqlite:")


def sqlite_path(url: str) -> str:
    """Extract the SQLite file path from a DATABASE_URL."""
    for prefix in _SQLITE_PREFIXES:
        if url.startswith(prefix):
            return url[len(prefix):]
    return url


def quote_table(key: str) -> str:
    """'schema.table' -> '"schema"."table"', safe for reserved words and SQLite main."""
    return ".".join(f'"{p}"' for p in str(key).split("."))


class Driver:
    """Thin psycopg(2/3) / sqlite3 adapter returning [{column: value}]."""

    def __init__(self, url: str) -> None:
        self.url = url
        self._conn3 = None   # psycopg3
        self._conn2 = None   # psycopg2
        self._sqlite = None  # sqlite3

    def __enter__(self) -> "Driver":
        if is_sqlite(self.url):
            import sqlite3

            self._sqlite = sqlite3.connect(sqlite_path(self.url))
            return self
        try:
            import psycopg  # type: ignore # v3

            self._conn3 = psycopg.connect(self.url)
            self._conn3.autocommit = True
            return self
        except Exception:  # noqa: BLE001
            self._conn3 = None
        try:
            import psycopg2  # type: ignore # v2

            self._conn2 = psycopg2.connect(self.url)
            self._conn2.autocommit = True
            return self
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(
                "Cannot connect to PostgreSQL: neither psycopg nor psycopg2 is available.\n"
                "Install one of them: pip install 'psycopg[binary]' or pip install psycopg2-binary.\n"
                f"Underlying error: {exc}"
            ) from exc

    def __exit__(self, *_exc) -> None:  # noqa: ANN002
        for conn in (self._conn3, self._conn2, self._sqlite):
            if conn is not None:
                try:
                    conn.close()
                except Exception:  # noqa: BLE001
                    pass

    def query(self, sql: str, params: Sequence[Any] = ()) -> List[Dict[str, Any]]:
        if self._conn3 is not None:
            cur = self._conn3.cursor()
            cur.execute(sql, list(params) if params else None)
            cols = [d.name for d in cur.description] if cur.description else []
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]
            cur.close()
            return rows
        if self._conn2 is not None:
            cur = self._conn2.cursor()
            cur.execute(sql, list(params) if params else None)
            cols = [d[0] for d in cur.description] if cur.description else []
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]
            cur.close()
            return rows
        if self._sqlite is not None:
            cur = self._sqlite.cursor()
            if params:
                cur.execute(sql, list(params))
            else:
                cur.execute(sql)
            cols = [d[0] for d in cur.description] if cur.description else []
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]
            cur.close()
            return rows
        raise RuntimeError("Driver is not connected: use `with Driver(url) as drv:`.")


@dataclass
class SchemaInfo:
    tables: Dict[str, List[str]] = field(default_factory=dict)  # schema.table -> [columns]
    role_map: Dict[str, str] = field(default_factory=dict)      # role -> schema.table

    @property
    def missing(self) -> List[str]:
        return [r for r in ("order", "line") if r not in self.role_map]

    def short(self, role: str) -> Optional[str]:
        val = self.role_map.get(role)
        return val.split(".", 1)[-1] if val else None

    def cols_for(self, role: str) -> List[str]:
        key = self.role_map.get(role)
        return list(self.tables.get(key, ())) if key else []


def _low(cols: Sequence[str]) -> set:
    return {c.lower() for c in cols}


def list_schema(cfg: Config) -> SchemaInfo:
    """Enumerate business tables/columns (PostgreSQL: information_schema; SQLite: sqlite_master)."""
    if not cfg.database_url:
        raise RuntimeError(
            "DATABASE_URL is not configured. Set it in s4-recommendation/.env, or generate a "
            "single-file simulation DB with scripts/build_simulated_db.py and set "
            "DATABASE_URL=sqlite:///<path>."
        )
    if is_sqlite(cfg.database_url):
        return _list_schema_sqlite(cfg.database_url)
    return _list_schema_postgres(cfg.database_url)


def _list_schema_postgres(url: str) -> SchemaInfo:
    tables: Dict[str, List[str]] = {}
    with Driver(url) as drv:
        schema_sql = ", ".join("'%s'" % s for s in _IGNORED_SCHEMAS)
        rows = drv.query(
            f"""
            SELECT table_schema, table_name, column_name
            FROM information_schema.columns
            WHERE table_schema NOT IN ({schema_sql})
              AND table_schema NOT LIKE 'pg\\_%'
            ORDER BY table_schema, table_name, ordinal_position
            """
        )
    for r in rows:
        key = f"{r['table_schema']}.{r['table_name']}"
        tables.setdefault(key, []).append(r["column_name"])
    return SchemaInfo(tables=dict(sorted(tables.items())))


def _list_schema_sqlite(url: str) -> SchemaInfo:
    tables: Dict[str, List[str]] = {}
    with Driver(url) as drv:
        rows = drv.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        for r in rows:
            name = r["name"]
            if name.startswith("sqlite_"):
                continue
            quoted = name.replace('"', '""')
            cols = drv.query(f'PRAGMA table_info("{quoted}")')
            tables[f"main.{name}"] = [c["name"] for c in cols]
    return SchemaInfo(tables=dict(sorted(tables.items())))


def _score_key(
    key: str,
    cols: Sequence[str],
    need: Sequence[Sequence[str]],
    name_hits: Sequence[str],
) -> int:
    """Score how well a table matches a role.

    Each item in ``need`` is a synonym group; every group must match at least one column.
    ``name_hits`` then adds points the closer the table name is to a preferred name.
    Example: need=(("order_id",), ("product_id", "variant_product_id")).
    """
    low = _low(cols)
    for group in need:
        synonyms = (group,) if isinstance(group, str) else tuple(group)
        if not any(s.lower() in low for s in synonyms):
            return -1
    nm = key.split(".", 1)[-1].lower()
    score = 0
    for hit in name_hits:
        if nm == hit:
            score += 1000
        elif hit in nm:
            score += 100
        elif nm in hit:
            score += 60
    return score


def _best(
    tables: Dict[str, List[str]],
    need: Sequence[Sequence[str]],
    name_hits: Sequence[str],
    exclude_name_hits: Sequence[str] = (),
) -> Optional[str]:
    """Pick the table that best matches a role.

    Required columns come first, then the name score. Tables whose name contains any of
    ``exclude_name_hits`` are skipped entirely (e.g. the order line role must ignore
    `product_category_product` and `product_review`, which also carry a product_id).
    """
    name_hits = tuple(h.lower() for h in name_hits)
    exclude_name_hits = tuple(h.lower() for h in exclude_name_hits)
    candidates = []
    for key, cols in tables.items():
        nm = key.split(".", 1)[-1].lower()
        if any(x in nm for x in exclude_name_hits):
            continue
        s = _score_key(key, cols, need, name_hits)
        if s >= 0:
            candidates.append((s, key))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][1]


# Role -> (required column synonym groups, preferred table names).
#
# Order lines come in two shapes:
#   * Medusa v2  : `order_line_item` holds product_id but no order_id; the link table
#                  `order_item` (order_id + item_id) connects it to `order`.
#   * legacy/demo: a single line table carrying both order_id and product_id.
# Both are supported (see data_loader.fetch_purchases).
ROLE_SPECS = {
    "product": ((("id",), ("title", "name")), ("product", "products")),
    "order":   ((("id",), ("customer_id", "user_id", "buyer_id")), ("order", "orders")),
    "line":    ((("product_id", "variant_product_id"),),
                ("order_line_item", "order_line", "line_item", "line")),
    "order_item_link": ((("order_id",), ("item_id", "line_item_id", "order_line_item_id")),
                        ("order_item",)),
    "customer": ((("id",),), ("customer", "customers")),
    "product_category_join": ((("product_id", "product_variant_id"),
                               ("category_id", "product_category_id")),
                              ("product_category_product",)),
    "category": ((("id",),), ("product_category", "category")),
}

# Tables whose name contains one of these are never chosen for the given role, even when
# their columns happen to fit (guards against pivot/review/cart tables).
ROLE_EXCLUDE = {
    "line": ("category", "review", "rating", "cart", "message", "address"),
}

ROLE_ORDER = ("product", "order", "line", "order_item_link", "customer",
              "product_category_join", "category")


def resolve_roles(cfg: Config, info: SchemaInfo) -> SchemaInfo:
    """Fill ``role_map``: DB_ROLE_OVERRIDE wins, otherwise automatic detection."""
    override = {k: v for k, v in (cfg.role_override or {}).items() if v}
    tables = info.tables

    info.role_map.clear()
    for role in ROLE_ORDER:
        if role in override and override[role] in tables:
            info.role_map[role] = override[role]
            continue
        need, name_hits = ROLE_SPECS[role]
        key = _best(tables, need, name_hits, ROLE_EXCLUDE.get(role, ()))
        if key:
            info.role_map[role] = key
    return info


def describe(info: SchemaInfo) -> str:
    lines = ["Resolved roles:"]
    if info.role_map:
        for r, k in sorted(info.role_map.items()):
            lines.append(f"  {r:22s}-> {k}  columns: {', '.join(info.tables.get(k, ()))}")
    else:
        lines.append("  (none)")
    if info.missing:
        lines.append("Unresolved (use DB_ROLE_OVERRIDE): " + ", ".join(info.missing))
    lines.append(f"\nTotal business tables: {len(info.tables)}")
    return "\n".join(lines)
