"""Rule-weighted scores. The rule tables are data; the scorer just walks them.

Long maximum is 105 (+ rs_score_weight). Nothing is clipped except the optional
display value. `normalised = raw / max_possible` so weight changes do not silently
change what a score means.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional

from .config import ScanConfig
from .types import (
    Band,
    BarPattern,
    Fundamentals,
    MomentumLeg,
    ScoreBreakdown,
    ScoreComponent,
    ShortSignals,
    Side,
    VcpResult,
)


@dataclass(frozen=True)
class LongFeatures:
    leg: MomentumLeg
    vcp: VcpResult
    bar_pattern: BarPattern
    colour_change: bool
    rs_vs_nifty: Optional[float]
    fundamentals: Optional[Fundamentals]


RuleFn = Callable[[LongFeatures, ScanConfig], tuple[float, Optional[float], Optional[str], bool, Optional[str]]]
# returns (points, value, unit, matched, detail)


def _trend(f: LongFeatures, cfg: ScanConfig):
    if f.vcp.stage2:
        return 20, None, None, True, "Stage 2: close > EMA200 and EMA50 > EMA200"
    if f.vcp.above_ema50:
        return 10, None, None, True, "close above EMA50 (within tolerance)"
    return 0, None, None, False, None


def _momentum(f: LongFeatures, cfg: ScanConfig):
    if f.leg.move_pct is not None and f.leg.move_pct >= cfg.min_momentum_pct:
        return 20, f.leg.move_pct, "pct", True, f"window move >= {cfg.min_momentum_pct}%"
    if f.leg.max_daily_pct is not None and f.leg.max_daily_pct >= cfg.min_daily_candle_pct:
        return 12, f.leg.max_daily_pct, "pct", True, f"single-day move >= {cfg.min_daily_candle_pct}%"
    return 0, f.leg.move_pct, "pct", False, None


def _depth(f: LongFeatures, cfg: ScanConfig):
    d = f.vcp.depth_pct
    if not f.vcp.valid or d is None:
        return 0, d, "pct", False, None
    if 8.0 <= d <= 15.0:
        return 10, d, "pct", True, "depth 8-15%"
    if 15.0 < d <= 20.0:
        return 7, d, "pct", True, "depth >15-20%"
    return 4, d, "pct", True, "depth otherwise within configured range"


def _vol_dry(f: LongFeatures, cfg: ScanConfig):
    v = f.vcp.vol_dry_pct
    if v is None:
        return 0, None, "pct of leg volume", False, None
    if v < 35:
        return 10, v, "pct of leg volume", True, "<35%"
    if v < 50:
        return 7, v, "pct of leg volume", True, "<50%"
    if v < 70:
        return 3, v, "pct of leg volume", True, "<70%"
    return 0, v, "pct of leg volume", False, None


def _entry(f: LongFeatures, cfg: ScanConfig):
    if f.bar_pattern.kind:
        return 10, f.bar_pattern.trigger, "INR", True, f"{f.bar_pattern.kind} trigger"
    return 0, None, None, False, None


def _colour(f: LongFeatures, cfg: ScanConfig):
    return (5 if f.colour_change else 0), None, None, f.colour_change, None


def _rev(f: LongFeatures, cfg: ScanConfig):
    v = None if f.fundamentals is None else f.fundamentals.revenue_growth
    if v is None:
        return 0, None, "pct YoY", False, "missing"
    if v >= 20:
        return 8, v, "pct YoY", True, ">=20%"
    if v >= cfg.min_revenue_growth:
        return 5, v, "pct YoY", True, f">={cfg.min_revenue_growth}%"
    return 0, v, "pct YoY", False, None


def _eps(f: LongFeatures, cfg: ScanConfig):
    v = None if f.fundamentals is None else f.fundamentals.eps_growth
    if v is None:
        return 0, None, "pct YoY", False, "missing"
    if v >= 25:
        return 8, v, "pct YoY", True, ">=25%"
    if v >= cfg.min_eps_growth:
        return 5, v, "pct YoY", True, f">={cfg.min_eps_growth}%"
    return 0, v, "pct YoY", False, None


def _roe(f: LongFeatures, cfg: ScanConfig):
    v = None if f.fundamentals is None else f.fundamentals.roe
    if v is None:
        return 0, None, "pct", False, "missing"
    if v >= 20:
        return 7, v, "pct", True, ">=20%"
    if v >= cfg.min_roe:
        return 4, v, "pct", True, f">={cfg.min_roe}%"
    return 0, v, "pct", False, None


def _fcf(f: LongFeatures, cfg: ScanConfig):
    v = None if f.fundamentals is None else f.fundamentals.fcf_positive
    if v is None:
        return 0, None, None, False, "missing"
    return (7 if v else 0), None, None, bool(v), None


def _rs(f: LongFeatures, cfg: ScanConfig):
    if cfg.rs_score_weight <= 0:
        return 0, f.rs_vs_nifty, "pct points", False, "weight 0 (disabled)"
    if f.rs_vs_nifty is None:
        return 0, None, "pct points", False, "missing"
    return (cfg.rs_score_weight if f.rs_vs_nifty > 0 else 0), f.rs_vs_nifty, "pct points", f.rs_vs_nifty > 0, None


LONG_RULES: tuple[tuple[str, str, float | str, RuleFn], ...] = (
    ("trend", "Trend (Stage 2 / above EMA50)", 20, _trend),
    ("momentum", "Momentum leg", 20, _momentum),
    ("vcp_depth", "VCP depth", 10, _depth),
    ("volume_dry", "Volume dry-up", 10, _vol_dry),
    ("entry_pattern", "Entry pattern (IB/MB)", 10, _entry),
    ("colour_change", "Colour change", 5, _colour),
    ("revenue_growth", "Revenue growth", 8, _rev),
    ("eps_growth", "EPS growth", 8, _eps),
    ("roe", "Return on equity", 7, _roe),
    ("fcf_positive", "Free cash flow positive", 7, _fcf),
    ("rs_vs_nifty", "Relative strength vs Nifty", "rs_score_weight", _rs),
)


def band_for(raw: float, cfg: ScanConfig) -> Band:
    if raw >= cfg.band_a_min:
        return Band.A
    if raw >= cfg.band_b_min:
        return Band.B
    return Band.C


def _finish(side: Side, comps: list[ScoreComponent], cfg: ScanConfig) -> ScoreBreakdown:
    raw = float(sum(c.points for c in comps))
    max_possible = float(sum(c.max_points for c in comps))
    display = min(raw, 100.0) if cfg.clip_score_display_at_100 else raw
    return ScoreBreakdown(
        side=side,
        raw=raw,
        max_possible=max_possible,
        normalised=(raw / max_possible) if max_possible > 0 else 0.0,
        display=display,
        band=band_for(raw, cfg),
        components=tuple(comps),
    )


def score_long(f: LongFeatures, cfg: ScanConfig) -> ScoreBreakdown:
    comps = []
    for rule_id, label, max_pts, fn in LONG_RULES:
        mp = float(getattr(cfg, max_pts)) if isinstance(max_pts, str) else float(max_pts)
        pts, value, unit, matched, detail = fn(f, cfg)
        comps.append(ScoreComponent(rule_id, label, float(pts), mp, bool(matched), value, unit, detail))
    return _finish(Side.LONG, comps, cfg)


SHORT_RULES: tuple[tuple[str, str, float, str], ...] = (
    ("stage4", "Stage 4 (close < EMA50 and < EMA200)", 25, "stage4"),
    ("downtrend", "Lower highs and lower lows (20 bars)", 20, "downtrend"),
    ("double_top", "Double top within tolerance", 20, "double_top"),
    ("weak_bounce", "Weak bounce", 15, "weak_bounce"),
    ("low_vol_bounce", "Low-volume bounce", 10, "low_vol_bounce"),
    ("red_confirm", "Red confirmation candle", 10, "red_confirm"),
)


def score_short(s: ShortSignals, cfg: ScanConfig) -> ScoreBreakdown:
    comps = []
    for rule_id, label, max_pts, attr in SHORT_RULES:
        matched = bool(getattr(s, attr))
        value = s.bounce_ratio if attr == "weak_bounce" else None
        comps.append(ScoreComponent(rule_id, label, float(max_pts if matched else 0), float(max_pts), matched, value, "ratio" if value is not None else None, None))
    return _finish(Side.SHORT, comps, cfg)
