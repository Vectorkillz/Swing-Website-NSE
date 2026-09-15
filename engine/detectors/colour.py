"""Colour change: last candle green, two prior red, close above EMA50."""

from __future__ import annotations

import pandas as pd

from ..indicators import last


def colour_change(df: pd.DataFrame) -> bool:
    if len(df) < 3:
        return False
    o = df["open"].to_numpy(dtype=float)
    c = df["close"].to_numpy(dtype=float)
    e50 = last(df, "ema50")
    if e50 is None:
        return False
    return bool(c[-1] > o[-1] and c[-2] < o[-2] and c[-3] < o[-3] and c[-1] > e50)
