import pytest

from engine.portfolio import rank_candidates
from engine.risk import plan_long, plan_short
from engine.types import Band, Candidate, RankStatus, Regime, ScoreBreakdown, Side, StopRule, TargetRule
from tests.conftest import make_regime


def test_long_plan_levels(cfg):
    r = make_regime(Regime.BULL, cfg)
    p = plan_long(close=100.0, prev_bar_low=97.0, atr14=2.0, regime=r, cfg=cfg, leg_high=112.0)
    assert p.entry == pytest.approx(100.2) and p.entry_max == pytest.approx(100.8)
    # candidates: pct 97.695, atr 97.2, prev_low 96.515 -> tightest (highest) = pct
    assert p.stop_rule is StopRule.PCT and p.stop == pytest.approx(100.2 * 0.975)
    assert not p.floor_applied
    assert p.r_value == pytest.approx(100.8 - p.stop)  # risk measured from the do-not-chase price
    assert p.target == 112.0 and p.target_rule is TargetRule.STRUCTURE
    assert p.reward_risk == pytest.approx((112.0 - 100.2) / p.r_value)
    assert p.extended_target == pytest.approx(p.entry + 3 * p.r_value)
    assert p.trail_weekly_ema is None and any("weekly EMA20" in n for n in p.notes)


def test_long_target_min_rr_and_fallback(cfg):
    r = make_regime(Regime.BULL, cfg)
    near = plan_long(100.0, 97.0, 2.0, r, cfg, leg_high=101.0)  # leg high barely above entry: inside 1R
    assert near.target_rule is TargetRule.MIN_RR and near.reward_risk == pytest.approx(cfg.target_fallback_r)
    assert near.target == pytest.approx(near.entry + cfg.target_fallback_r * near.r_value)
    below = plan_long(100.0, 97.0, 2.0, r, cfg, leg_high=95.0)  # leg high below entry
    assert below.target_rule is TargetRule.FALLBACK and below.reward_risk == pytest.approx(cfg.target_fallback_r)
    none = plan_long(100.0, 97.0, 2.0, r, cfg, leg_high=None)
    assert none.target_rule is TargetRule.FALLBACK


def test_stop_floor_prevents_hair_thin_stop(cfg):
    """Defect 7.1: prev_low a hair under the close must not produce a near-zero risk per share."""
    r = make_regime(Regime.BULL, cfg)
    p = plan_long(close=100.0, prev_bar_low=99.9, atr14=0.05, regime=r, cfg=cfg, leg_high=110.0)
    assert p.floor_applied and p.stop_rule is StopRule.FLOOR
    assert p.stop_distance_pct == pytest.approx(cfg.min_stop_distance_pct)
    assert p.r_value > 0


def test_no_long_plan_in_bear_or_unknown(cfg):
    assert plan_long(100.0, 97.0, 2.0, make_regime(Regime.BEAR, cfg), cfg) is None
    assert plan_long(100.0, 97.0, 2.0, make_regime(Regime.UNKNOWN, cfg), cfg) is None
    assert plan_short(100.0, 2.0, make_regime(Regime.UNKNOWN, cfg), cfg) is None


def test_shorts_in_bull_high_vix_follow_flag(cfg):
    assert plan_short(100.0, 2.0, make_regime(Regime.BULL_HIGH_VIX, cfg), cfg) is None
    allow = cfg.model_copy(update={"allow_shorts_in_bull_high_vix": True})
    assert plan_short(100.0, 2.0, make_regime(Regime.BULL_HIGH_VIX, allow), allow) is not None


def test_short_plan_levels(cfg):
    r = make_regime(Regime.BEAR, cfg)
    p = plan_short(close=100.0, atr14=2.0, regime=r, cfg=cfg, recent_low=90.0)
    assert p.entry == pytest.approx(99.8)
    assert p.stop_rule is StopRule.PCT and p.stop == pytest.approx(102.5)  # pct 102.5 < atr 102.8
    assert p.target == 90.0 and p.target_rule is TargetRule.STRUCTURE
    assert p.target < p.entry < p.stop
    close_low = plan_short(100.0, 2.0, r, cfg, recent_low=99.0)
    assert close_low.target_rule is TargetRule.MIN_RR and close_low.target == pytest.approx(close_low.entry - cfg.target_fallback_r * close_low.r_value)


def test_weekly_trails_from_daily(fx, cfg):
    r = make_regime(Regime.BULL, cfg)
    daily = fx("long_vcp_ok")
    p = plan_long(float(daily["close"].iloc[-1]), float(daily["low"].iloc[-2]), 2.0, r, cfg, leg_high=None, daily_for_weekly=daily)
    assert p.weekly_bars_available >= 30
    assert p.trail_weekly_ema is not None and p.trail_weekly_sma is not None


def _cand(symbol, side, raw, with_plan=True):
    from engine.types import TradePlan

    plan = None
    if with_plan:
        plan = TradePlan(side=side, entry=100.0, entry_max=100.8, stop=97.0, stop_rule=StopRule.PCT, floor_applied=False, stop_candidates={},
                         stop_distance_pct=3.0, r_value=3.8, risk_reference_price=100.8, target=110.0, target_rule=TargetRule.STRUCTURE,
                         target_structure_level=110.0, reward_risk=2.6, target_pct=10.0, extended_target=111.4, extended_target_r=3.0, atr14=1.0)
    score = ScoreBreakdown(side, raw, 105.0, raw / 105.0, min(raw, 100.0), Band.B, ())
    return Candidate(symbol=symbol, side=side, sector="Tech", name=None, close=100.0, last_bar_date="2026-09-10", score=score, plan=plan)


def test_rank_sorts_and_caps_top_n(cfg):
    c = cfg.model_copy(update={"top_n_longs": 2})
    cands = [_cand("B", Side.LONG, 70), _cand("A", Side.LONG, 70), _cand("C", Side.LONG, 90), _cand("Z", Side.LONG, 95, with_plan=False)]
    by = {x.symbol: x for x in rank_candidates(cands, c)}
    assert by["C"].rank == 1 and by["A"].rank == 2  # tie broken by symbol
    assert by["B"].rank_status is RankStatus.NOT_IN_TOP_N
    assert by["Z"].rank is None and by["Z"].rank_reason == "no plan"
