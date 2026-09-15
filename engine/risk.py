"""Trade plans: entry, stop, size, exits.

Safety invariants enforced here (see tests/test_invariants_hypothesis.py):
* risk_per_share > 0
* stop_distance_pct >= min_stop_distance_pct (floor)
* qty x sizing_price <= capital x max_position_pct_of_capital
* long stop < entry, short stop > entry; long partials above entry, short targets below.

Long sizing uses `entry_max` (the do-not-chase limit) as the worst-case fill price,
so a fill anywhere in the entry zone never exceeds the risk budget.
"""

from __future__ import annotations

import math

import pandas as pd

from .config import ScanConfig
from .indicators import resample_weekly, weekly_trails
from .types import RegimeResult, Side, StopRule, TradePlan


def _floor_stop(entry: float, stop: float, side: Side, rule: StopRule, cfg: ScanConfig) -> tuple[float, StopRule, bool]:
    min_dist = entry * cfg.min_stop_distance_pct / 100.0
    if side is Side.LONG:
        if entry - stop < min_dist:
            return entry - min_dist, StopRule.FLOOR, True
    else:
        if stop - entry < min_dist:
            return entry + min_dist, StopRule.FLOOR, True
    return stop, rule, False


def _size(sizing_price: float, risk_per_share: float, mult: float, cfg: ScanConfig) -> tuple[int, int, int, list[str]]:
    caps: list[str] = []
    risk_budget = cfg.capital * cfg.risk_per_trade_pct / 100.0
    qty_raw = int(math.floor(risk_budget / risk_per_share))
    qty_regime = int(math.floor(qty_raw * mult))
    if qty_regime < qty_raw:
        caps.append(f"regime_multiplier x{mult:g}")
    max_value = cfg.capital * cfg.max_position_pct_of_capital / 100.0
    qty = qty_regime
    if qty * sizing_price > max_value:
        qty = int(math.floor(max_value / sizing_price))
        caps.append(f"max_position_pct_of_capital {cfg.max_position_pct_of_capital:g}% (value cap {max_value:.0f} INR)")
    if qty <= 0:
        caps.append("position_too_small (qty 0)")
        qty = 0
    return qty_raw, qty_regime, qty, caps


def plan_long(
    close: float,
    prev_bar_low: float,
    atr14: float,
    regime: RegimeResult,
    cfg: ScanConfig,
    daily_for_weekly: pd.DataFrame | None = None,
) -> TradePlan | None:
    if regime.size_multiplier is None or not regime.longs_allowed:
        return None
    entry = close * (1.0 + cfg.long_entry_offset_pct / 100.0)
    entry_max = close * (1.0 + cfg.long_entry_max_offset_pct / 100.0)
    candidates = {
        StopRule.PCT.value: entry * (1.0 - cfg.sl_pct / 100.0),
        StopRule.ATR.value: entry - cfg.sl_atr_mult * atr14,
        StopRule.PREV_LOW.value: prev_bar_low * (1.0 - cfg.prev_low_stop_buffer_pct / 100.0),
    }
    # tightest stop for a long = the highest candidate
    rule_name, stop = max(candidates.items(), key=lambda kv: kv[1])
    rule = StopRule(rule_name)
    stop, rule, floored = _floor_stop(entry, stop, Side.LONG, rule, cfg)
    notes: list[str] = []
    if floored:
        notes.append(f"stop distance floored at {cfg.min_stop_distance_pct:g}% of entry (defect 7.1 guard)")

    sizing_price = entry_max
    risk_per_share = sizing_price - stop
    if risk_per_share <= 0:
        return None
    qty_raw, qty_regime, qty, caps = _size(sizing_price, risk_per_share, regime.size_multiplier, cfg)
    r = risk_per_share

    weekly = resample_weekly(daily_for_weekly) if daily_for_weekly is not None else None
    ema_w, sma_w = weekly_trails(weekly, cfg.trail_ema_weeks, cfg.trail_sma_weeks) if weekly is not None else (None, None)
    wbars = None if weekly is None else int(len(weekly))
    if ema_w is None:
        notes.append(f"weekly EMA{cfg.trail_ema_weeks} trail unavailable (<{cfg.trail_ema_weeks} weekly bars)")
    if sma_w is None:
        notes.append(f"weekly SMA{cfg.trail_sma_weeks} trail unavailable (<{cfg.trail_sma_weeks} weekly bars)")

    return TradePlan(
        side=Side.LONG,
        entry=entry,
        entry_max=entry_max,
        stop=stop,
        stop_rule=rule,
        floor_applied=floored,
        stop_candidates=candidates,
        stop_distance_pct=(entry - stop) / entry * 100.0,
        risk_per_share=risk_per_share,
        sizing_price=sizing_price,
        atr14=atr14,
        prev_bar_low=prev_bar_low,
        qty_raw=qty_raw,
        qty_after_regime=qty_regime,
        qty=qty,
        regime_multiplier=regime.size_multiplier,
        caps_applied=tuple(caps),
        position_value=qty * sizing_price,
        risk_amount=qty * risk_per_share,
        r_value=r,
        breakeven_trigger=entry + cfg.breakeven_at_r * r,
        partial_1_price=entry + cfg.partial_exit_1_r * r,
        partial_1_pct=cfg.partial_exit_1_pct,
        partial_2_price=entry * (1.0 + cfg.partial_exit_2_gain_pct / 100.0),
        partial_2_pct=cfg.partial_exit_2_pct,
        trail_weekly_ema=ema_w,
        trail_weekly_sma=sma_w,
        trail_weekly_ema_len=cfg.trail_ema_weeks,
        trail_weekly_sma_len=cfg.trail_sma_weeks,
        weekly_bars_available=wbars,
        multibagger_arm_price=entry * (1.0 + cfg.multibagger_arm_pct / 100.0),
        notes=tuple(notes),
    )


def plan_short(close: float, atr14: float, regime: RegimeResult, cfg: ScanConfig) -> TradePlan | None:
    if regime.size_multiplier is None or not regime.shorts_allowed:
        return None
    entry = close * (1.0 - cfg.short_entry_offset_pct / 100.0)
    candidates = {
        StopRule.PCT.value: close * (1.0 + cfg.sl_pct / 100.0),
        StopRule.ATR.value: entry + cfg.sl_atr_mult * atr14,
    }
    # tightest stop for a short = the lowest candidate
    rule_name, stop = min(candidates.items(), key=lambda kv: kv[1])
    rule = StopRule(rule_name)
    stop, rule, floored = _floor_stop(entry, stop, Side.SHORT, rule, cfg)
    notes: list[str] = []
    if floored:
        notes.append(f"stop distance floored at {cfg.min_stop_distance_pct:g}% of entry")
    risk_per_share = stop - entry
    if risk_per_share <= 0:
        return None
    qty_raw, qty_regime, qty, caps = _size(entry, risk_per_share, regime.size_multiplier, cfg)
    r = risk_per_share
    return TradePlan(
        side=Side.SHORT,
        entry=entry,
        entry_max=None,
        stop=stop,
        stop_rule=rule,
        floor_applied=floored,
        stop_candidates=candidates,
        stop_distance_pct=(stop - entry) / entry * 100.0,
        risk_per_share=risk_per_share,
        sizing_price=entry,
        atr14=atr14,
        prev_bar_low=None,
        qty_raw=qty_raw,
        qty_after_regime=qty_regime,
        qty=qty,
        regime_multiplier=regime.size_multiplier,
        caps_applied=tuple(caps),
        position_value=qty * entry,
        risk_amount=qty * risk_per_share,
        r_value=r,
        target_1_price=entry - cfg.short_target_1_r * r,
        target_1_pct=cfg.short_target_1_pct,
        target_2_price=entry - cfg.short_target_2_r * r,
        target_2_pct=cfg.short_target_2_pct,
        notes=tuple(notes),
    )
