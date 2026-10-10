"""Load the product catalogue and user-item interactions from the resolved tables.

Two normalised structures are produced for downstream cleaning/training:
  - CatalogItem : product metadata (used for content similarity, titles and thumbnails)
  - Interaction : a single user-item contact (purchase by default; views optional)

Every table name is quoted through `quote_table()` so that reserved words (e.g. the
PostgreSQL `order` table) and SQLite's `main.<table>` both work.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence

from .database import Driver, SchemaInfo, quote_table


@dataclass
class CatalogItem:
    product_id: str
    title: str = ""
    handle: Optional[str] = None
    thumbnail: Optional[str] = None
    meta: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Interaction:
    customer_id: str
    product_id: str
    order_id: str = ""
    action: str = "purchase"   # purchase | view
    weight: float = 1.0        # relative strength (purchase > view); NULL -> 1.0
    meta: Dict[str, Any] = field(default_factory=dict)


def _pick(cols: Sequence[str], candidates: Sequence[str]) -> Optional[str]:
    """Return the first real column matching one of the candidates (case-insensitive)."""
    low = {c.lower(): c for c in cols}
    for syn in candidates:
        if syn.lower() in low:
            return low[syn.lower()]
    return None


def fetch_catalog(cfg, info: SchemaInfo, driver: Driver) -> List[CatalogItem]:
    """Read the product table (+ optional category pivot) into a CatalogItem list."""
    prod_key = info.role_map.get("product")
    if not prod_key:
        return []
    pcols = info.cols_for("product")
    if not {"id", "title"} <= {c.lower() for c in pcols} and "name" not in {c.lower() for c in pcols}:
        raise ValueError(
            f"product table ({prod_key}) lacks an id and a title/name column; "
            f"point it with DB_ROLE_OVERRIDE. Actual columns: {', '.join(pcols)}"
        )
    id_col = _pick(pcols, ("id",))
    title_col = _pick(pcols, ("title", "name"))
    handle_col = _pick(pcols, ("handle", "slug"))
    thumb_col = _pick(pcols, ("thumbnail", "thumbnail_url", "image_url"))

    # Category pivot: attach product<->category names for content features.
    join_key = info.role_map.get("product_category_join")
    cat_key = info.role_map.get("category")
    pid_to_cat: Dict[str, str] = {}
    if join_key and cat_key:
        jcols = info.tables[join_key]
        j_pid = _pick(jcols, ("product_id", "product_variant_id"))
        j_cid = _pick(jcols, ("category_id", "product_category_id", "category"))
        ccols = info.tables[cat_key]
        c_id = _pick(ccols, ("id",))
        c_name = _pick(ccols, ("title", "name", "handle"))
        if j_pid and j_cid and c_id and c_name:
            rows = driver.query(f'SELECT "{j_pid}", "{j_cid}" FROM {quote_table(join_key)}')
            id2name = {str(r[c_id]): str(r[c_name]) for r in driver.query(
                f'SELECT "{c_id}", "{c_name}" FROM {quote_table(cat_key)}'
            )}
            for r in rows:
                name = id2name.get(str(r[j_cid]))
                if name:
                    pid_to_cat.setdefault(str(r[j_pid]), name)

    out: List[CatalogItem] = []
    rows = driver.query(f'SELECT "{id_col}", "{title_col}"'
                        + (f', "{handle_col}"' if handle_col else "")
                        + (f', "{thumb_col}"' if thumb_col else "")
                        + f" FROM {quote_table(prod_key)}")
    for r in rows:
        pid = str(r[id_col])
        out.append(CatalogItem(
            product_id=pid,
            title=str(r[title_col] or ""),
            handle=str(r[handle_col]) if handle_col else None,
            thumbnail=str(r[thumb_col]) if thumb_col else None,
            meta={"categories": pid_to_cat.get(pid, "")},
        ))
    return out


def fetch_purchases(cfg, info: SchemaInfo, driver: Driver) -> List[Interaction]:
    """Extract purchases, supporting both order-line layouts.

    * Medusa v2 (two-hop):  order <- order_item(order_id, item_id) -> order_line_item(product_id)
    * legacy/demo (single) : the line table itself carries order_id + product_id

    Cancelled orders are excluded when the order table has a ``status`` column; rows with a
    NULL quantity fall back to weight 1.0. Raises a clear error when the needed columns are
    missing (including the real column list for debugging).
    """
    line_key = info.role_map.get("line")
    if not line_key:
        raise RuntimeError("Could not resolve the order line table.")
    order_key = info.role_map.get("order")
    link_key = info.role_map.get("order_item_link")

    lcols = info.cols_for("line")
    pc = _pick(lcols, ("product_id", "variant_product_id"))
    l_order = _pick(lcols, ("order_id", "order"))
    l_qty = _pick(lcols, ("quantity", "qty"))
    l_price = _pick(lcols, ("unit_price", "price", "amount"))
    if not pc:
        raise RuntimeError(
            f"line table {line_key} lacks a product_id column; point it with DB_ROLE_OVERRIDE. "
            f"Actual columns: {', '.join(lcols)}"
        )

    if order_key:
        ocols = info.cols_for("order")
        o_pk = _pick(ocols, ("id",)) or (ocols[0] if ocols else "id")
        cc = _pick(ocols, ("customer_id", "user_id", "buyer_id", "customer"))
        if not cc:
            raise RuntimeError(f"order table {order_key} lacks a customer_id column: {ocols}")
        st = _pick(ocols, ("status",))
        # `status` may be a PostgreSQL enum, so CAST to TEXT before comparing and keep
        # NULL rows (CAST works on both PostgreSQL and SQLite).
        where = (f"\n WHERE (o.\"{st}\" IS NULL OR CAST(o.\"{st}\" AS TEXT)"
                 " NOT IN ('canceled','cancelled'))") if st else ""

        if l_order:
            # Single-table layout: the line table carries order_id itself.
            sql = f'SELECT o."{cc}" AS _cid, l."{pc}" AS _pid, l."{l_order}" AS _oid'
            if l_qty:
                sql += f', l."{l_qty}" AS _qty'
            if l_price:
                sql += f', l."{l_price}" AS _amount'
            sql += (f' FROM {quote_table(line_key)} l'
                    f' JOIN {quote_table(order_key)} o ON o."{o_pk}" = l."{l_order}"' + where)
        else:
            # Two-hop layout (Medusa v2): order_item links order -> line item.
            if not link_key:
                raise RuntimeError(
                    f"line table {line_key} has no order_id and no link table was resolved; "
                    "set DB_ROLE_OVERRIDE for role 'order_item_link'."
                )
            xcols = info.cols_for("order_item_link")
            x_order = _pick(xcols, ("order_id",))
            x_item = _pick(xcols, ("item_id", "line_item_id", "order_line_item_id"))
            l_pk = _pick(lcols, ("id",)) or "id"
            if not (x_order and x_item):
                raise RuntimeError(f"link table {link_key} lacks order_id/item_id: {xcols}")
            sql = f'SELECT o."{cc}" AS _cid, l."{pc}" AS _pid, l."{l_pk}" AS _oid'
            if l_qty:
                sql += f', l."{l_qty}" AS _qty'
            if l_price:
                sql += f', l."{l_price}" AS _amount'
            sql += (f' FROM {quote_table(link_key)} x'
                    f' JOIN {quote_table(order_key)} o ON o."{o_pk}" = x."{x_order}"'
                    f' JOIN {quote_table(line_key)} l ON l."{l_pk}" = x."{x_item}"' + where)
    else:
        # No order table: fall back to a customer column on the line table.
        cc2 = _pick(lcols, ("customer_id", "user_id", "buyer_id", "customer"))
        if not cc2:
            raise RuntimeError("Neither an order table nor a customer_id column on the line table.")
        l_pk = _pick(lcols, ("id",)) or "id"
        sql = f'SELECT "{cc2}" AS _cid, "{pc}" AS _pid, "{l_pk}" AS _oid'
        if l_qty:
            sql += f', "{l_qty}" AS _qty'
        if l_price:
            sql += f', "{l_price}" AS _amount'
        sql += f" FROM {quote_table(line_key)}"

    rows = driver.query(sql)
    out: List[Interaction] = []
    for r in rows:
        pid, cid = str(r["_pid"]), str(r["_cid"])
        if not pid or not cid:
            continue
        w = 1.0
        try:
            q = float(r["_qty"] or 1) if "_qty" in r else 1.0
            w = max(q, 0.0) or 1.0
        except (TypeError, ValueError):
            pass
        out.append(Interaction(
            customer_id=cid, product_id=pid,
            order_id=str(r.get("_oid") or ""), action="purchase", weight=w,
            meta={"amount": r.get("_amount")} if "_amount" in r else {},
        ))
    return out


def apply_views(cfg, views: Sequence[Interaction], purchases: List[Interaction]) -> List[Interaction]:
    """Merge optional view/click records with a lower weight (deduplicated against purchases)."""
    merged = list(purchases)
    seen = {(i.customer_id, i.product_id) for i in purchases}
    for v in views:
        if (v.customer_id, v.product_id) not in seen:
            v.weight = max(v.weight * getattr(cfg, "view_weight", 0.5), 0.01)
            merged.append(v)
            seen.add((v.customer_id, v.product_id))
    return merged
