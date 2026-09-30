"""S4 recommendation engine package.

Data pipeline (PostgreSQL / SQLite) → preprocessing → collaborative-filtering models
→ offline evaluation → RecommendationItem-compatible JSON export.
"""
from .config import get_config

__version__ = "0.1.0"

__all__ = ["get_config", "__version__"]
