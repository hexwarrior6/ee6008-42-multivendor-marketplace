"""Command-line entry point for the recommender.

Typical usage (from s4-recommendation/):
  python -m recommender.train --inspect
  python -m recommender.train --models all --export artifacts/recommendations.json
  python -m recommender.train --offline-rows scripts/sample_orders.csv

Missing dependencies never fail silently: a clear message is printed and the model is
skipped (e.g. numpy / lightfm).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Allow `python -m recommender.train` from any working directory.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from . import config as cfgmod  # noqa: E402
from . import content_based as contentmod  # noqa: E402
from . import database  # noqa: E402
from . import preprocessing as cleanmod  # noqa: E402

MODELS = ("svd", "als", "lightfm")


def build_argparser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="S4 recommender: clean -> train -> evaluate -> export")
    p.add_argument("--models", default=os.environ.get("MODELS", "svd,als"),
                   help="comma-separated: svd|als|lightfm|all (default: env MODELS or svd,als)")
    p.add_argument("--factors", type=int, default=None)
    p.add_argument("--iters", type=int, default=None)
    p.add_argument("--k", type=int, default=None)
    p.add_argument("--holdout-per-user", type=int, default=1)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--inspect", action="store_true", help="print resolved roles and exit")
    p.add_argument("--export", default=None, help="output JSON path")
    p.add_argument("--offline-rows", default=None,
                   help="offline CSV (no DB): customer_id,product_id,title,weight[,handle,thumbnail]")
    return p


def parse_models(spec: str) -> List[str]:
    spec = (spec or "svd").lower().replace(" ", "")
    if spec == "all":
        return list(MODELS)
    return [m for m in (s.strip() for s in spec.split(",")) if m in MODELS]


def main(argv: Optional[List[str]] = None) -> int:
    args, cfg = _early(argv)
    if args.inspect:
        info = database.list_schema(cfg)
        database.resolve_roles(cfg, info)
        print(database.describe(info))
        return 0

    catalog_items, interactions = _load(cfg, args)
    if not interactions:
        print("No user-product interactions found. Check DATABASE_URL or --offline-rows.")
        return 2
    if not catalog_items:
        print("Catalogue is empty; interactions cannot be resolved to known products.")
        return 2

    content = contentmod.ContentRecommender().fit(catalog_items, _count_pid(interactions))
    cd = cleanmod.clean_interactions(interactions, catalog_items)
    print("[clean]", cleanmod.describe(cd))
    if cd.n_users < 1 or cd.n_items < 1:
        print("No valid records after cleaning.")
        return 2

    train_cd, ground, _ = cleanmod.train_test_split(cd, args.holdout_per_user, seed=args.seed)
    metrics: Dict[str, dict] = {}
    winner_model: Optional[object] = None
    trained: Dict[str, object] = {}
    if cd.non_zero < 8 or not ground:
        print("[notice] too few interactions - no collaborative metrics this run; "
              "exporting content/cold-start recommendations only.")
    else:
        for name in parse_models(args.models):
            try:
                model = _instantiate(name, cfg, args)
                model.fit(train_cd.rows, cd.n_users, cd.n_items)
                trained[name] = model
                bundle, metrics[name] = _evaluate(name, model, ground, train_cd, cd, cfg, args)
            except Exception as exc:  # noqa: BLE001
                print(f"[model:{name}] skipped - {exc}")
        if metrics:
            winner_name = max(metrics, key=lambda n: (metrics[n]["recall@K"], metrics[n]["precision@K"]))
            winner_model = trained[winner_name]
            print(f"[select] best by recall@K: {winner_name}: " +
                  "  ".join(f"{k}={v}" for k, v in metrics[winner_name].items()))
        print("[metrics]", json.dumps(metrics, ensure_ascii=False))

    payload = _build_payload(cfg, winner_model, cd, train_cd, content,
                             catalog_items, args)
    out_path = args.export or os.path.join(cfg.out_dir, "recommendations.json")
    serve_dump(out_path, payload, winner_model.name() if winner_model else "content",
               version=f"reco-v1-{time.strftime('%Y%m%d-%H%M', time.gmtime())}")
    print(f"[export] {out_path}")
    print("[done]")
    return 0


def _early(argv):
    args = build_argparser().parse_args(argv)
    return args, cfgmod.get_config()


def _load(cfg, args):
    from . import data_loader as loadmod

    if args.offline_rows:
        import csv
        from io import StringIO

        with open(args.offline_rows, newline="", encoding="utf-8-sig") as fh:
            content = fh.read()
        # Drop leading comment lines so they are not mistaken for the CSV header.
        body = [ln for ln in content.splitlines()
                if ln.strip() and not ln.lstrip().startswith("#")]
        if not body:
            raise SystemExit(f"{args.offline_rows} is empty / comments only.")

        seen: Dict[str, loadmod.CatalogItem] = {}
        rows = []
        dr = csv.DictReader(StringIO("\n".join(body)))
        for rr in dr:
            pid = str(rr.get("product_id") or "").strip()
            cid = str(rr.get("customer_id") or "").strip()
            if not pid or not cid:
                continue
            weight = 1.0
            try:
                weight = float(rr.get("weight") or 1.0)
            except ValueError:
                weight = 1.0
            rows.append(loadmod.Interaction(cid, pid, weight=weight))
            seen.setdefault(pid, loadmod.CatalogItem(pid, str(rr.get("title") or pid),
                                                     rr.get("handle"), rr.get("thumbnail")))
        return list(seen.values()), rows

    info = database.list_schema(cfg)
    database.resolve_roles(cfg, info)
    if "line" not in info.role_map:
        print(database.describe(info))
        raise SystemExit("Could not resolve the order_line table. Run --inspect and use "
                         "DB_ROLE_OVERRIDE to point it.")
    with database.Driver(cfg.database_url) as drv:
        catalog = loadmod.fetch_catalog(cfg, info, drv)
        purchases = loadmod.fetch_purchases(cfg, info, drv)
    if not catalog:
        catalog = [loadmod.CatalogItem(i.product_id, i.product_id) for i in purchases]
    return catalog, loadmod.apply_views(cfg, [], purchases)


def _instantiate(name, cfg, args):
    factors = args.factors or cfg.factors
    iters = args.iters or cfg.iters
    if name == "svd":
        from .models.svd_model import SVDPredictor
        return SVDPredictor(n_factors=factors, user_mean=True)
    if name == "als":
        from .models.als_model import ALSPredictor
        return ALSPredictor(n_factors=factors, iters=iters)
    if name == "lightfm":
        from .models.lightfm_model import LightFMPredictor, available
        if not available():
            raise ImportError("LightFM is not installed (pip install lightfm scipy).")
        return LightFMPredictor(n_factors=factors, iters=iters)
    raise ValueError(name)


def _evaluate(name, model, ground, train_cd, cd, cfg, args):
    from . import evaluation as evalmod

    k = args.k or cfg.k
    bundle = evalmod.evaluate(model, ground, train_cd, cd.item_ids, int(k))
    summary = bundle.as_dict()
    summary["model"] = name
    print(f"| {name:<9}" + "  ".join(f"{kk}={vv}" for kk, vv in summary.items() if kk != "model"))
    return bundle, summary


def serve_dump(path: str, payload: dict, src: str, version: str = "reco-v1"):
    payload = dict(payload)
    payload.update({"source": src, "model_version": version,
                    "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
    Path(os.path.dirname(path) or ".").mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1)


def _word_masks(catalog_items) -> Tuple[Dict, Dict, Dict]:
    titles, handles, thumbs = {}, {}, {}
    for c in catalog_items:
        titles[c.product_id] = c.title
        if c.handle:
            handles[c.product_id] = c.handle
        if c.thumbnail:
            thumbs[c.product_id] = c.thumbnail
    return titles, handles, thumbs


def _build_payload(cfg, winner_model, cd, train_cd, content, catalog_items, args) -> dict:
    from . import exporter

    k = args.k or cfg.k
    titles, handles, thumbs = _word_masks(catalog_items)
    by_user = (exporter.export_user(winner_model, cd, int(k), titles, handles, thumbs)
               if winner_model else {})
    by_product = exporter.export_product_similar(content, cd, int(k), titles, handles, thumbs)
    fallback = exporter.export_fallback(content, int(k), titles, handles, thumbs)
    return {"by_user": by_user, "by_product": by_product, "fallback": fallback}


def _count_pid(interactions):
    from collections import Counter

    return Counter(i.product_id for i in interactions)


if __name__ == "__main__":
    raise SystemExit(main())
