"""Short-side signals: Stage 4, downtrend structure, double top, weak bounce, low-volume bounce, red bar."""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..config import ScanConfig
from ..indicators import last
from ..types import ShortSignals

MIN_BARS = 60


def _downtrend(high: np.ndarray, low: np.ndarray) -> bool:
    """Over the last 20 bars: high[i] <= high[i-2] and low[i] <= low[i-2] for every second bar."""
    h, l = high[-20:], low[-20:]
    return bool(all(h[i] <= h[i - 2] for i in range(2, 20, 2)) and all(l[i] <= l[i - 2] for i in range(2, 20, 2)))


def _double_top(high: np.ndarray, tol_pct: float) -> tuple[bool, float, float]:
    p1 = float(high[-40:-20].max())
    p2 = float(high[-20:].max())
    within = abs(p1 - p2) / max(p1, p2) * 100.0 < tol_pct
    return bool(within), p1, p2


def _weak_bounce(df: pd.DataFrame, cfg: ScanConfig) -> tuple[bool, float | None]:
    close = df["close"].to_numpy(dtype=float)
    high = df["high"].to_numpy(dtype=float)
    low = df["low"].to_numpy(dtype=float)
    swing_low = float(close[-10])  # reference uses close 10 bars back as the bounce origin
    bounce = float(close[-1]) - swing_low

    if cfg.weak_bounce_method == "single_bar_high":
        ref_high = float(high[-40])  # reference behaviour, one bar's high (defect 7.6 preserved by flag)
    else:
        # swing_high: swing low = lowest low of the last 10 bars; swing start = the most recent pivot high
        # (higher than the 2 bars either side) before the swing low within the last 40 bars;
        # denominator uses the highest high between swing start and swing low.
        n = len(df)
        low_pos = n - 10 + int(low[-10:].argmin())
        pivot = None
        for i in range(low_pos - 1, max(n - 40, 2) - 1, -1):
            if i + 2 < n and high[i] > high[i - 1] and high[i] > high[i - 2] and high[i] > high[i + 1] and high[i] > high[i + 2]:
                pivot = i
                break
        if pivot is None:
            pivot = max(n - 40, 0)
        ref_high = float(high[pivot : low_pos + 1].max())
        swing_low = float(low[low_pos])
        bounce = float(close[-1]) - swing_low

    decline = ref_high - swing_low
    if decline <= 0:
        return False, None
    ratio = bounce / decline
    return bool(ratio < cfg.weak_bounce_max_ratio), float(ratio)


def short_signals(df: pd.DataFrame, cfg: ScanConfig) -> ShortSignals | None:
    """`df` must carry ema50, ema200, vol20 columns. Returns None with too few bars."""
    if len(df) < MIN_BARS:
        return None
    high = df["high"].to_numpy(dtype=float)
    low = df["low"].to_numpy(dtype=float)
    close = float(df["close"].iloc[-1])
    open_ = float(df["open"].iloc[-1])
    e50, e200, v20 = last(df, "ema50"), last(df, "ema200"), last(df, "vol20")
    stage4 = e50 is not None and e200 is not None and close < e50 and close < e200
    dt = _downtrend(high, low)
    dbl, p1, p2 = _double_top(high, cfg.double_top_tolerance_pct)
    weak, ratio = _weak_bounce(df, cfg)
    recent_vol = float(df["volume"].iloc[-5:].astype(float).mean())
    low_vol = v20 is not None and recent_vol < cfg.low_volume_bounce_factor * v20
    red = close < open_
    return ShortSignals(
        stage4=bool(stage4),
        downtrend=dt,
        double_top=dbl,
        weak_bounce=weak,
        low_vol_bounce=bool(low_vol),
        red_confirm=bool(red),
        weak_bounce_method=cfg.weak_bounce_method,
        bounce_ratio=ratio,
        double_top_peak1=p1,
        double_top_peak2=p2,
        ema50=e50,
        ema200=e200,
        recent_mean_volume=recent_vol,
        vol20=v20,
    )
