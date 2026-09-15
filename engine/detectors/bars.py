"""Inside bar and mother bar entry triggers (scored, optional)."""

from __future__ import annotations

import pandas as pd

from ..config import ScanConfig
from ..types import BarPattern


def _date(df: pd.DataFrame, i: int) -> str:
    return pd.Timestamp(df.index[i]).date().isoformat()


def inside_bar(df: pd.DataFrame, lookback: int) -> BarPattern | None:
    n = len(df)
    high = df["high"].to_numpy(dtype=float)
    low = df["low"].to_numpy(dtype=float)
    # scan backwards over the last `lookback` bars; i is the inside bar, i-1 its mother
    for i in range(n - 1, max(n - lookback, 1) - 1, -1):
        if high[i] < high[i - 1] and low[i] > low[i - 1]:
            return BarPattern(kind="IB", trigger=float(high[i - 1]), pattern_low=float(low[i - 1]), bar_idx=i, bar_date=_date(df, i))
    return None


def mother_bar(df: pd.DataFrame, lookback: int) -> BarPattern | None:
    n = len(df)
    if n < lookback:
        return None
    seg = df.iloc[-lookback:]
    rng = (seg["high"] - seg["low"]).to_numpy(dtype=float)
    avg = float(rng.mean())
    if avg <= 0:
        return None
    for j in range(lookback - 1):  # a mother bar needs at least one later bar
        if rng[j] > 1.5 * avg and all(rng[k] < 0.7 * rng[j] for k in range(j + 1, lookback)):
            i = n - lookback + j
            return BarPattern(kind="MB", trigger=float(seg["high"].iloc[j]), pattern_low=float(seg["low"].iloc[j]), bar_idx=i, bar_date=_date(df, i))
    return None


def detect_bar_pattern(df: pd.DataFrame, cfg: ScanConfig) -> BarPattern:
    ib = inside_bar(df, cfg.bar_pattern_lookback)
    if ib is not None:
        return ib
    mb = mother_bar(df, cfg.bar_pattern_lookback)
    if mb is not None:
        return mb
    return BarPattern(kind=None)
