"""Trade plans as price levels: entry zone, stop, target(s), trails. No sizing.

Invariants (tests/test_invariants_hypothesis.py):
* r_value > 0
* stop_distance_pct >= min_stop_distance_pct
* long: stop < entry < target; short: target < entry < stop
* reward_risk >= target_min_rr
"""

from __future__ import annotations

import pandas as pd

from .config import ScanConfig
from .indicators import resample_weekly, weekly_trails
from .types import RegimeResult, Side, StopRule, TargetRule, TradePlan


def _floor_stop(entry: float, stop: float, side: Side, rule: StopRule, cfg: ScanConfig) -> tuple[float, StopRule, bool]:
    min_dist = entry * cfg.min_stop_distance_pct / 100.0
    if side is Side.LONG and entry - stop < min_dist:
        return entry - min_dist, StopRule.FLOOR, True
    if side is Side.SHORT and stop - entry < min_dist:
        return entry + min_dist, StopRule.FLOOR, True
    return stop, rule, False


def _target(entry: float, r: float, side: Side, structure: float | None, cfg: ScanConfig) -> tuple[float, TargetRule, float]:
    """Structure-based target with a minimum reward:risk floor. Returns (target, rule, rr)."""
    sign = 1.0 if side is Side.LONG else -1.0
    min_target = entry + sign * cfg.target_min_rr * r
    beyond = structure is not None and (structure > entry if side is Side.LONG else structure < entry)
    if not beyond:
        t = entry + sign * cfg.target_fallback_r * r
        return t, TargetRule.FALLBACK, cfg.target_fallback_r
    assert structure is not None
    if (structure >= min_target) if side is Side.LONG else (structure <= min_target):
        return structure, TargetRule.STRUCTURE, abs(structure - entry) / r
    # structural level exists but is inside the minimum reward:risk -> use the fallback multiple
    t = entry + sign * cfg.target_fallback_r * r
    return t, TargetRule.MIN_RR, cfg.target_fallback_r


def plan_long(
    close: float,
    prev_bar_low: float,
    atr14: float,
    regime: RegimeResult,
    cfg: ScanConfig,
    leg_high: float | None = None,
    daily_for_weekly: pd.DataFrame | None = None,
) -> TradePlan | None:
    if not regime.longs_allowed:
        return None
    entry = close * (1.0 + cfg.long_entry_offset_pct / 100.0)
    entry_max = close * (1.0 + cfg.long_entry_max_offset_pct / 100.0)
    candidates = {
        StopRule.PCT.value: entry * (1.0 - cfg.sl_pct / 100.0),
        StopRule.ATR.value: entry - cfg.sl_atr_mult * atr14,
        StopRule.PREV_LOW.value: prev_bar_low * (1.0 - cfg.prev_low_stop_buffer_pct / 100.0),
    }
    rule_name, stop = max(candidates.items(), key=lambda kv: kv[1])  # tightest for a long = highest
    stop, rule, floored = _floor_stop(entry, stop, Side.LONG, StopRule(rule_name), cfg)
    notes: list[str] = []
    if floored:
        notes.append(f"stop distance floored at {cfg.min_stop_distance_pct:g}% of entry")
    r = entry_max - stop  # worst-case fill inside the entry zone
    if r <= 0:
        return None
    target, trule, rr = _target(entry, r, Side.LONG, leg_high, cfg)
    if trule is TargetRule.FALLBACK:
        notes.append(f"no structural level above entry; target set at {cfg.target_fallback_r:g}R")
    elif trule is TargetRule.MIN_RR:
        notes.append(f"leg high inside {cfg.target_min_rr:g}R; target set at {cfg.target_fallback_r:g}R")

    weekly = resample_weekly(daily_for_weekly) if daily_for_weekly is not None else None
    ema_w, sma_w = weekly_trails(weekly, cfg.trail_ema_weeks, cfg.trail_sma_weeks) if weekly is not None else (None, None)
    wbars = None if weekly is None else int(len(weekly))
    if ema_w is None:
        notes.append(f"weekly EMA{cfg.trail_ema_weeks} trail unavailable (<{cfg.trail_ema_weeks} weekly bars)")
    if sma_w is None:
        notes.append(f"weekly SMA{cfg.trail_sma_weeks} trail unavailable (<{cfg.trail_sma_weeks} weekly bars)")

    return TradePlan(
        side=Side.LONG, entry=entry, entry_max=entry_max, stop=stop, stop_rule=rule, floor_applied=floored,
        stop_candidates=candidates, stop_distance_pct=(entry - stop) / entry * 100.0, r_value=r, risk_reference_price=entry_max,
        target=target, target_rule=trule, target_structure_level=leg_high, reward_risk=rr, target_pct=(target / entry - 1.0) * 100.0,
        extended_target=entry + cfg.extended_target_r * r, extended_target_r=cfg.extended_target_r, atr14=atr14, prev_bar_low=prev_bar_low,
        breakeven_trigger=entry + cfg.breakeven_at_r * r,
        trail_weekly_ema=ema_w, trail_weekly_sma=sma_w, trail_weekly_ema_len=cfg.trail_ema_weeks, trail_weekly_sma_len=cfg.trail_sma_weeks,
        weekly_bars_available=wbars, multibagger_arm_price=entry * (1.0 + cfg.multibagger_arm_pct / 100.0), notes=tuple(notes),
    )


def plan_short(close: float, atr14: float, regime: RegimeResult, cfg: ScanConfig, recent_low: float | None = None) -> TradePlan | None:
    if not regime.shorts_allowed:
        return None
    entry = close * (1.0 - cfg.short_entry_offset_pct / 100.0)
    candidates = {
        StopRule.PCT.value: close * (1.0 + cfg.sl_pct / 100.0),
        StopRule.ATR.value: entry + cfg.sl_atr_mult * atr14,
    }
    rule_name, stop = min(candidates.items(), key=lambda kv: kv[1])  # tightest for a short = lowest
    stop, rule, floored = _floor_stop(entry, stop, Side.SHORT, StopRule(rule_name), cfg)
    notes: list[str] = []
    if floored:
        notes.append(f"stop distance floored at {cfg.min_stop_distance_pct:g}% of entry")
    r = stop - entry
    if r <= 0:
        return None
    target, trule, rr = _target(entry, r, Side.SHORT, recent_low, cfg)
    if trule is TargetRule.FALLBACK:
        notes.append(f"no structural level below entry; target set at {cfg.target_fallback_r:g}R")
    elif trule is TargetRule.MIN_RR:
        notes.append(f"recent low inside {cfg.target_min_rr:g}R; target set at {cfg.target_fallback_r:g}R")
    return TradePlan(
        side=Side.SHORT, entry=entry, entry_max=None, stop=stop, stop_rule=rule, floor_applied=floored,
        stop_candidates=candidates, stop_distance_pct=(stop - entry) / entry * 100.0, r_value=r, risk_reference_price=entry,
        target=target, target_rule=trule, target_structure_level=recent_low, reward_risk=rr, target_pct=(target / entry - 1.0) * 100.0,
        extended_target=entry - cfg.extended_target_r * r, extended_target_r=cfg.extended_target_r, atr14=atr14, notes=tuple(notes),
    )
