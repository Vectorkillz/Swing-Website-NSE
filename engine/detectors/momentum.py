"""Momentum leg: the best `window` bar run inside the last `lookback` bars."""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..config import ScanConfig
from ..types import MomentumLeg


def momentum_leg(df: pd.DataFrame, cfg: ScanConfig) -> MomentumLeg:
    lookback, window = cfg.leg_lookback_bars, cfg.leg_window_bars
    n = len(df)
    if n < window + 1:
        return MomentumLeg(found=False, rejected_reason="insufficient_bars")
    start_base = max(0, n - lookback)
    close = df["close"].to_numpy(dtype=float)
    high = df["high"].to_numpy(dtype=float)
    vol = df["volume"].to_numpy(dtype=float)

    best: tuple[float, int] | None = None  # (move, start)
    for s in range(start_base, n - window + 1):
        seg = close[s : s + window]
        move = (seg[-1] - seg[0]) / seg[0] * 100.0
        if best is None or move > best[0]:
            best = (move, s)
    assert best is not None
    move, s = best
    e = s + window - 1
    seg = close[s : e + 1]
    daily = np.diff(seg) / seg[:-1] * 100.0
    max_daily = float(daily.max()) if len(daily) else 0.0
    by_move = move >= cfg.min_momentum_pct
    by_daily = max_daily >= cfg.min_daily_candle_pct
    age = n - 1 - e
    dates = df.index
    leg = dict(
        move_pct=float(move),
        max_daily_pct=max_daily,
        leg_high=float(high[s : e + 1].max()),
        leg_mean_volume=float(vol[s : e + 1].mean()),
        start_idx=int(s),
        end_idx=int(e),
        start_date=pd.Timestamp(dates[s]).date().isoformat(),
        end_date=pd.Timestamp(dates[e]).date().isoformat(),
        age_bars=int(age),
        qualifies_by_move=bool(by_move),
        qualifies_by_daily=bool(by_daily),
    )
    if not (by_move or by_daily):
        return MomentumLeg(found=False, rejected_reason="below_thresholds", **leg)
    if cfg.max_leg_age_bars is not None and age > cfg.max_leg_age_bars:
        return MomentumLeg(found=False, rejected_reason=f"leg_too_old:{age}>{cfg.max_leg_age_bars}", **leg)
    return MomentumLeg(found=True, **leg)
