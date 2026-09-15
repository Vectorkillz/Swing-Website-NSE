"""Canonical, deterministic serialisation.

Every run output goes through `dumps`. Floats are rounded to 6 decimal places,
NaN/inf become null, keys are sorted, separators are compact. This is what makes
"same input + same config => byte-identical output" testable.
"""

from __future__ import annotations

import dataclasses
import enum
import hashlib
import json
import math
from datetime import date, datetime
from typing import Any, Mapping

import numpy as np
import pandas as pd

FLOAT_DECIMALS = 6


def round_float(x: float) -> float | None:
    if x is None:
        return None
    if isinstance(x, (np.floating,)):
        x = float(x)
    if math.isnan(x) or math.isinf(x):
        return None
    r = round(x, FLOAT_DECIMALS)
    if r == 0:
        return 0.0  # normalise -0.0
    return r


def to_jsonable(obj: Any) -> Any:
    """Convert dataclasses, enums, numpy/pandas scalars, dates into plain JSON types."""
    if obj is None or isinstance(obj, (bool, str)):
        return obj
    if isinstance(obj, enum.Enum):
        return obj.value
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, (int, np.integer)) and not isinstance(obj, bool):
        return int(obj)
    if isinstance(obj, (float, np.floating)):
        return round_float(float(obj))
    if isinstance(obj, (datetime, pd.Timestamp)):
        return obj.isoformat()
    if isinstance(obj, date):
        return obj.isoformat()
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return {f.name: to_jsonable(getattr(obj, f.name)) for f in dataclasses.fields(obj)}
    if hasattr(obj, "model_dump"):
        return to_jsonable(obj.model_dump(mode="python"))
    if isinstance(obj, Mapping):
        return {str(k): to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set, frozenset)):
        items = list(obj)
        if isinstance(obj, (set, frozenset)):
            items = sorted(items, key=lambda v: json.dumps(to_jsonable(v), sort_keys=True))
        return [to_jsonable(v) for v in items]
    if isinstance(obj, np.ndarray):
        return [to_jsonable(v) for v in obj.tolist()]
    if isinstance(obj, pd.Series):
        return [to_jsonable(v) for v in obj.tolist()]
    raise TypeError(f"Cannot canonicalise object of type {type(obj)!r}")


def dumps(obj: Any) -> str:
    return json.dumps(
        to_jsonable(obj),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )


def dumps_pretty(obj: Any) -> str:
    return json.dumps(
        to_jsonable(obj),
        sort_keys=True,
        indent=2,
        ensure_ascii=False,
        allow_nan=False,
    ) + "\n"


def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def frame_to_canonical_csv(df: pd.DataFrame) -> str:
    """Deterministic CSV text for hashing OHLCV frames."""
    out = df.copy()
    out = out.sort_index()
    cols = [c for c in ["open", "high", "low", "close", "volume"] if c in out.columns]
    out = out[cols]
    idx_name = out.index.name or "date"
    out.index = pd.Index([pd.Timestamp(i).strftime("%Y-%m-%d") for i in out.index], name=idx_name)
    return out.to_csv(float_format="%.6f", lineterminator="\n")


def snapshot_hash(frames: Mapping[str, pd.DataFrame | None], extra: Mapping[str, Any] | None = None) -> str:
    """Hash of all input frames (sorted by key) plus optional extra canonical JSON."""
    h = hashlib.sha256()
    for key in sorted(frames):
        h.update(key.encode("utf-8"))
        h.update(b"\x00")
        df = frames[key]
        if df is None:
            h.update(b"<none>")
        else:
            h.update(frame_to_canonical_csv(df).encode("utf-8"))
        h.update(b"\x01")
    if extra is not None:
        h.update(dumps(extra).encode("utf-8"))
    return h.hexdigest()
