"""Centralised configuration: real environment variables first, then a local ``.env`` file.

Pure standard library — no third-party dependency.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional


def _load_dotenv(path: str | None = None) -> None:
    """Minimal ``.env`` parser.

    Only fills in variables that are **not** already present in ``os.environ``
    (real environment variables always win) and performs **no** interpolation.
    """
    dotenv = Path(path or os.path.join(os.getcwd(), ".env"))
    if not dotenv.exists():
        return
    with dotenv.open("r", encoding="utf-8-sig") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


@dataclass
class Config:
    database_url: Optional[str] = None
    role_override: Dict[str, str] = field(default_factory=dict)
    recurring_table: Optional[str] = None
    view_weight: float = 0.5
    out_dir: str = "artifacts"
    factors: int = 32
    iters: int = 15
    k: int = 8

    def ensure_out_dir(self) -> Path:
        p = Path(self.out_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p


def get_config() -> Config:
    _load_dotenv()

    url = os.environ.get("DATABASE_URL")
    if not url:
        # Fall back to assembling the URL from individual PG* parts.
        pg_user = os.environ.get("PGUSER", "medusa")
        pg_pass = os.environ.get("PGPASSWORD", "medusa")
        pg_host = os.environ.get("PGHOST", "localhost")
        pg_port = os.environ.get("PGPORT", "5432")
        pg_db = os.environ.get("PGDATABASE")
        if pg_db:
            url = f"postgresql://{pg_user}:{pg_pass}@{pg_host}:{pg_port}/{pg_db}"

    override: Dict[str, str] = {}
    raw_override = os.environ.get("DB_ROLE_OVERRIDE")
    if raw_override:
        try:
            parsed = json.loads(raw_override)
            if isinstance(parsed, dict):
                override = {str(k): str(v) for k, v in parsed.items()}
        except json.JSONDecodeError:
            print("[config] warning: DB_ROLE_OVERRIDE is not valid JSON; ignored.")

    return Config(
        database_url=url,
        role_override=override,
        recurring_table=os.environ.get("RECURRING_TABLE") or None,
        view_weight=float(_env_float("VIEW_WEIGHT", 0.5)),
        out_dir=os.environ.get("OUT_DIR", "artifacts"),
        factors=int(_env_float("FACTORS", 32)),
        iters=int(_env_float("ITERS", 15)),
        k=int(_env_float("K", 8)),
    )


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return _as_float(raw, default)


def _as_float(raw: Any, default: float) -> float:
    try:
        return float(raw)
    except (TypeError, ValueError):
        return default
