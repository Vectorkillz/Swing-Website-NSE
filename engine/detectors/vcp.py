"""Volatility contraction after a momentum leg."""

from __future__ import annotations

import pandas as pd

from ..config import ScanConfig
from ..indicators import last
from ..types import MomentumLeg, VcpResult


def vcp(df: pd.DataFrame, leg: MomentumLeg, cfg: ScanConfig) -> VcpResult:
    """`df` must already carry ema10/20/50/200 columns."""
    if not leg.found or leg.leg_high is None or leg.leg_mean_volume is None:
        return VcpResult(valid=False)
    close = float(df["close"].iloc[-1])
    depth = (leg.leg_high - close) / leg.leg_high * 100.0
    depth_ok = cfg.vcp_depth_min <= depth <= cfg.vcp_depth_max

    recent = float(df["volume"].iloc[-cfg.vcp_recent_volume_bars :].astype(float).mean())
    vol_dry = (recent / leg.leg_mean_volume * 100.0) if leg.leg_mean_volume > 0 else None
    vol_ok = vol_dry is not None and vol_dry < cfg.volume_dry_pct

    tol = 1.0 - cfg.ema_support_tolerance_pct / 100.0
    e10, e20, e50, e200 = (last(df, c) for c in ("ema10", "ema20", "ema50", "ema200"))
    a10 = e10 is not None and close >= e10 * tol
    a20 = e20 is not None and close >= e20 * tol
    a50 = e50 is not None and close >= e50 * tol
    stage2 = e50 is not None and e200 is not None and close > e200 and e50 > e200

    return VcpResult(
        valid=bool(depth_ok and vol_ok and a20),
        depth_pct=depth,
        depth_ok=bool(depth_ok),
        vol_dry_pct=vol_dry,
        vol_dry_ok=bool(vol_ok),
        above_ema10=bool(a10),
        above_ema20=bool(a20),
        above_ema50=bool(a50),
        stage2=bool(stage2),
        ema10=e10,
        ema20=e20,
        ema50=e50,
        ema200=e200,
        recent_mean_volume=recent,
    )
