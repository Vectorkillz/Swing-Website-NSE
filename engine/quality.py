"""Data-quality gates. A symbol failing any check is `data_unavailable` and excluded.

The engine never repairs data: no forward-fill, no default prices.
"""

from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd

from .config import ScanConfig
from .indicators import REQUIRED_COLUMNS


def check_daily(df: pd.DataFrame | None, expected_last_session: date, cfg: ScanConfig) -> list[str]:
    """Return a list of failure reasons (empty list = usable)."""
    reasons: list[str] = []
    if df is None or len(df) == 0:
        return ["no_data"]
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        return [f"missing_columns:{','.join(missing)}"]
    if not isinstance(df.index, pd.DatetimeIndex):
        return ["index_not_datetime"]
    if not df.index.is_monotonic_increasing:
        reasons.append("unsorted_index")
    if df.index.has_duplicates:
        reasons.append("duplicate_dates")
    if len(df) < cfg.min_daily_bars:
        reasons.append(f"min_bars<{cfg.min_daily_bars}:{len(df)}")
    prices = df[["open", "high", "low", "close"]]
    if prices.isna().any().any():
        reasons.append("nan_price")
    else:
        bad = prices.le(0).any(axis=1)
        if bad.any():
            first = df.index[bad.to_numpy().argmax()]
            reasons.append(f"nonpositive_price@{pd.Timestamp(first).date().isoformat()}")
    if df["volume"].isna().any() or (df["volume"] < 0).any():
        reasons.append("bad_volume")
    # gap check: business-day distance between consecutive bars
    if len(df) >= 2 and df.index.is_monotonic_increasing:
        idx = df.index.normalize()
        bdays = np.busday_count(idx[:-1].values.astype("datetime64[D]"), idx[1:].values.astype("datetime64[D]"))
        # a gap of k business days between bars means k-1 skipped sessions (holidays aside)
        worst = int(bdays.max()) if len(bdays) else 0
        if worst - 1 > cfg.max_gap_sessions:
            pos = int(bdays.argmax()) + 1
            reasons.append(f"gap>{cfg.max_gap_sessions}_sessions@{idx[pos].date().isoformat()}")
    last_bar = pd.Timestamp(df.index[-1]).date()
    if last_bar < expected_last_session:
        reasons.append(f"stale_last_bar:{last_bar.isoformat()}<{expected_last_session.isoformat()}")
    if last_bar > expected_last_session:
        reasons.append(f"future_bar:{last_bar.isoformat()}>{expected_last_session.isoformat()}")
    return reasons
