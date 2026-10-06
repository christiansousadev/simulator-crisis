"""single source of truth for the backend build version: backend/pyproject.toml"""

import tomllib
from functools import lru_cache
from pathlib import Path

_PYPROJECT_PATH = Path(__file__).resolve().parents[2] / "pyproject.toml"
_FALLBACK_VERSION = "1.0.0"


@lru_cache(maxsize=1)
def get_app_version() -> str:
    """READ [project].version FROM pyproject.toml, FALLING BACK TO A CONSTANT WHEN IT IS NOT SHIPPED"""
    try:
        with _PYPROJECT_PATH.open("rb") as handle:
            return str(tomllib.load(handle)["project"]["version"])
    except (OSError, KeyError, tomllib.TOMLDecodeError):
        return _FALLBACK_VERSION
