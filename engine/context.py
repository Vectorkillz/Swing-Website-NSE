"""Per-symbol context: 52-week range, ATR%, cap bucket, multibagger tag, swing suitability."""

from __future__ import annotations

import numpy as np
import pandas as pd

from .config import ScanConfig
from .indicators import last, roc_point
from .types import CapBucket, Fundamentals, MultibaggerLevel, MultibaggerTag, PriceContext

BARS_52W = 250


def cap_bucket(market_cap_cr: float | None, cfg: ScanConfig) -> CapBucket:
    if market_cap_cr is None:
        return CapBucket.UNKNOWN
    if market_cap_cr >= cfg.largecap_min_cr:
        return CapBucket.LARGE
    if market_cap_cr >= cfg.midcap_min_cr:
        return CapBucket.MID
    if market_cap_cr >= cfg.smallcap_min_cr:
        return CapBucket.SMALL
    return CapBucket.MICRO


def price_context(df: pd.DataFrame) -> PriceContext:
    """`df` carries atr14 and vol20 columns."""
    tail = df.iloc[-BARS_52W:]
    close = float(df["close"].iloc[-1])
    hi = float(tail["high"].max())
    lo = float(tail["low"].min())
    atr = last(df, "atr14")
    return PriceContext(
        high_52w=hi,
        low_52w=lo,
        pct_from_52w_high=(close / hi - 1.0) * 100.0 if hi > 0 else None,
        pct_above_52w_low=(close / lo - 1.0) * 100.0 if lo > 0 else None,
        atr_pct=(atr / close * 100.0) if atr is not None and close > 0 else None,
        roc_20=roc_point(df["close"], 20),
        avg_volume_20=last(df, "vol20"),
    )


def stage_label(df: pd.DataFrame) -> str | None:
    c = float(df["close"].iloc[-1])
    e50, e200 = last(df, "ema50"), last(df, "ema200")
    if e50 is None or e200 is None:
        return None
    if c > e200 and e50 > e200:
        return "stage2"
    if c < e50 and c < e200:
        return "stage4"
    return "transition"


def multibagger_tag(
    df: pd.DataFrame, ctx: PriceContext, rs_vs_nifty: float | None, f: Fundamentals | None, bucket: CapBucket, cfg: ScanConfig
) -> MultibaggerTag:
    """Trend-template style heuristic. Technical criteria must all hold for 'watch';
    'strong' additionally needs a growth criterion. Large caps are excluded by default."""
    c = float(df["close"].iloc[-1])
    e50, e200, s150 = last(df, "ema50"), last(df, "ema200"), last(df, "sma150")
    crit: dict[str, bool | None] = {
        "stage2": (c > e200 and e50 > e200) if e50 is not None and e200 is not None else None,
        "above_sma150": (c > s150) if s150 is not None else None,
        "sma150_above_ema200": (s150 > e200) if s150 is not None and e200 is not None else None,
        "above_52w_low": (ctx.pct_above_52w_low >= cfg.mb_min_above_52w_low_pct) if ctx.pct_above_52w_low is not None else None,
        "near_52w_high": (ctx.pct_from_52w_high >= -cfg.mb_max_below_52w_high_pct) if ctx.pct_from_52w_high is not None else None,
        "rs_positive": (rs_vs_nifty > 0) if rs_vs_nifty is not None else None,
        "not_large_cap": bucket is not CapBucket.LARGE if bucket is not CapBucket.UNKNOWN else None,
    }
    if not cfg.mb_require_rs_positive:
        crit.pop("rs_positive")
    if not cfg.mb_exclude_large_cap:
        crit.pop("not_large_cap")
    growth: bool | None = None
    if f is not None:
        rev_ok = f.revenue_growth is not None and f.revenue_growth >= cfg.mb_min_revenue_growth
        eps_ok = f.eps_growth is not None and f.eps_growth >= cfg.mb_min_eps_growth
        growth = bool(rev_ok or eps_ok) if (f.revenue_growth is not None or f.eps_growth is not None) else None
    crit["growth"] = growth
    tech = {k: v for k, v in crit.items() if k != "growth"}
    met = sum(1 for v in tech.values() if v)
    total = len(tech)
    all_tech = met == total
    if all_tech and growth:
        level = MultibaggerLevel.STRONG
    elif all_tech:
        level = MultibaggerLevel.WATCH
    else:
        level = MultibaggerLevel.NONE
    return MultibaggerTag(level=level, technical_met=met, technical_total=total, growth_met=bool(growth), criteria=crit)


def swing_suitability(ctx: PriceContext, f: Fundamentals | None, cfg: ScanConfig) -> tuple[bool, tuple[str, ...]]:
    """Liquidity and volatility sanity for a swing trade. Not a setup, just tradability."""
    notes: list[str] = []
    ok = True
    vol = ctx.avg_volume_20 if ctx.avg_volume_20 is not None else (f.avg_volume if f else None)
    if vol is None:
        notes.append("volume unknown")
        ok = False
    elif vol < cfg.min_avg_volume:
        notes.append(f"avg volume {vol:,.0f} < {cfg.min_avg_volume:,.0f}")
        ok = False
    if ctx.atr_pct is None:
        notes.append("ATR unknown")
        ok = False
    elif ctx.atr_pct < cfg.swing_min_atr_pct:
        notes.append(f"ATR {ctx.atr_pct:.1f}% too low")
        ok = False
    elif ctx.atr_pct > cfg.swing_max_atr_pct:
        notes.append(f"ATR {ctx.atr_pct:.1f}% too high")
        ok = False
    return ok, tuple(notes)
