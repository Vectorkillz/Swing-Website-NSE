"""Market regime classification and the single regime-effects table."""

from __future__ import annotations

import numpy as np
import pandas as pd

from .config import ScanConfig
from .indicators import ema
from .types import Regime, RegimeResult


def regime_effects(regime: Regime, cfg: ScanConfig) -> tuple[bool, bool, float | None]:
    """(longs_allowed, shorts_allowed, size_multiplier). One explicit table, no scattered ifs."""
    table = {
        Regime.BULL: (True, True, cfg.size_mult_bull),
        Regime.BULL_HIGH_VIX: (True, cfg.allow_shorts_in_bull_high_vix, cfg.size_mult_bull_high_vix),
        Regime.NEUTRAL: (True, True, cfg.size_mult_neutral),
        Regime.BEAR: (False, True, cfg.size_mult_bear),
        Regime.UNKNOWN: (False, False, None),
    }
    return table[regime]


def _unknown(reasons: list[str], **kw) -> RegimeResult:
    return RegimeResult(
        regime=Regime.UNKNOWN, longs_allowed=False, shorts_allowed=False, size_multiplier=None,
        reasons=tuple(reasons), **kw,
    )


def classify_regime(
    nifty: pd.DataFrame | None,
    vix_close: float | None,
    smallcap: pd.DataFrame | None,
    cfg: ScanConfig,
) -> RegimeResult:
    reasons: list[str] = []
    need = cfg.regime_ema_slow + 1
    if nifty is None or len(nifty) < need:
        reasons.append(f"nifty_unavailable_or_short(<{need} bars)")
        return _unknown(reasons)
    if vix_close is None or np.isnan(vix_close):
        reasons.append("vix_unavailable")
        # Still compute the Nifty figures for display, but the regime is UNKNOWN.
        close = nifty["close"]
        return _unknown(
            reasons,
            nifty_close=float(close.iloc[-1]),
            nifty_ema_fast=float(ema(close, cfg.regime_ema_fast).iloc[-1]),
            nifty_ema_slow=float(ema(close, cfg.regime_ema_slow).iloc[-1]),
        )

    close = nifty["close"]
    cur = float(close.iloc[-1])
    e_fast = float(ema(close, cfg.regime_ema_fast).iloc[-1])
    e_slow = float(ema(close, cfg.regime_ema_slow).iloc[-1])
    lookback = min(cfg.regime_roc_bars, len(close) - 1)
    base = float(close.iloc[-1 - lookback])
    roc_18m = (cur - base) / base * 100.0

    above_fast = cur > e_fast
    above_slow = cur > e_slow

    # Smallcap confirmation: always computed and reported.
    sc_conf = None
    sc_close = sc_fast = sc_slow = None
    if smallcap is not None and len(smallcap) >= cfg.regime_ema_slow:
        sc = smallcap["close"]
        sc_close = float(sc.iloc[-1])
        sc_fast = float(ema(sc, cfg.regime_ema_fast).iloc[-1])
        sc_slow = float(ema(sc, cfg.regime_ema_slow).iloc[-1])
        sc_conf = sc_close > sc_fast and sc_close > sc_slow
    else:
        reasons.append("smallcap_unavailable")

    bull = above_fast and above_slow and (cfg.roc_bull_min < roc_18m < cfg.roc_bull_max)
    bear = (not above_fast) and (not above_slow) and roc_18m < 0

    if bull and cfg.require_smallcap_confirmation_for_bull and not sc_conf:
        bull = False
        reasons.append("bull_blocked:smallcap_confirmation_failed" if sc_conf is False else "bull_blocked:smallcap_unavailable")

    if bull:
        regime = Regime.BULL_HIGH_VIX if vix_close > cfg.vix_long_suppress else Regime.BULL
        reasons.append(f"close>EMA{cfg.regime_ema_fast} and close>EMA{cfg.regime_ema_slow} and {cfg.roc_bull_min}<ROC({lookback})<{cfg.roc_bull_max}")
        if regime is Regime.BULL_HIGH_VIX:
            reasons.append(f"VIX {vix_close:.2f} > {cfg.vix_long_suppress}")
    elif bear:
        regime = Regime.BEAR
        reasons.append(f"close<EMA{cfg.regime_ema_fast} and close<EMA{cfg.regime_ema_slow} and ROC({lookback})<0")
    else:
        regime = Regime.NEUTRAL
        reasons.append("neither BULL nor BEAR conditions met")

    longs, shorts, mult = regime_effects(regime, cfg)
    if regime is Regime.BULL_HIGH_VIX and not shorts:
        reasons.append("shorts disabled in BULL_HIGH_VIX (allow_shorts_in_bull_high_vix=false)")

    return RegimeResult(
        regime=regime,
        longs_allowed=longs,
        shorts_allowed=shorts,
        size_multiplier=mult,
        nifty_close=cur,
        nifty_ema_fast=e_fast,
        nifty_ema_slow=e_slow,
        roc_18m=roc_18m,
        roc_bars_used=lookback,
        vix=float(vix_close),
        smallcap_confirms=sc_conf,
        smallcap_close=sc_close,
        smallcap_ema_fast=sc_fast,
        smallcap_ema_slow=sc_slow,
        reasons=tuple(reasons),
    )
