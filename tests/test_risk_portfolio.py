import pytest

from engine.config import ScanConfig
from engine.portfolio import apply_portfolio_constraints, rank_candidates
from engine.risk import plan_long, plan_short
from engine.types import Band, Candidate, OpenPosition, RankStatus, Regime, ScoreBreakdown, Side, StopRule
from tests.conftest import make_regime


def test_long_plan_basic(cfg):
    r = make_regime(Regime.BULL, cfg)
    p = plan_long(close=100.0, prev_bar_low=97.0, atr14=2.0, regime=r, cfg=cfg)
    assert p.entry == pytest.approx(100.2)
    assert p.entry_max == pytest.approx(100.8)
    # candidates: pct 97.695, atr 97.2, prev_low 96.515 -> tightest (highest) = pct
    assert p.stop_rule is StopRule.PCT and p.stop == pytest.approx(100.2 * 0.975)
    assert not p.floor_applied
    assert p.risk_per_share == pytest.approx(100.8 - p.stop)
    assert p.qty_raw == int(10000 // p.risk_per_share)  # 3220 shares from the 2% risk budget
    # ... but 3220 x 100.8 = 324,576 INR exceeds the 20% position cap (100,000 INR)
    assert p.qty == int(100000 // p.entry_max) == 992
    assert any("max_position_pct_of_capital" in c for c in p.caps_applied)
    assert p.risk_amount < 10000
    assert p.partial_1_price == pytest.approx(p.entry + 2 * p.r_value)
    assert p.partial_2_price == pytest.approx(p.entry * 1.2)
    assert p.trail_weekly_ema is None and any("weekly EMA20" in n for n in p.notes)


def test_stop_floor_prevents_size_blowup(fx, cfg):
    """Defect 7.1: prev_low a hair under the close must not collapse risk per share."""
    r = make_regime(Regime.BULL, cfg)
    close = 100.0
    p = plan_long(close=close, prev_bar_low=close * 0.999, atr14=0.05, regime=r, cfg=cfg)
    # ATR candidate = 100.2 - 0.075 = 100.125 is the tightest; the floor pulls it to 1% of entry
    assert p.floor_applied and p.stop_rule is StopRule.FLOOR
    assert p.stop_distance_pct == pytest.approx(cfg.min_stop_distance_pct)
    assert p.position_value <= cfg.capital * cfg.max_position_pct_of_capital / 100 + 1e-6
    assert "max_position_pct_of_capital" in " ".join(p.caps_applied)


def test_regime_multiplier_and_caps_recorded(cfg):
    r = make_regime(Regime.BULL_HIGH_VIX, cfg)
    p = plan_long(close=100.0, prev_bar_low=97.0, atr14=2.0, regime=r, cfg=cfg)
    assert p.regime_multiplier == 0.5
    assert p.qty_after_regime == int(p.qty_raw * 0.5)
    assert any(c.startswith("regime_multiplier") for c in p.caps_applied)


def test_no_long_plan_in_bear_or_unknown(cfg):
    assert plan_long(100.0, 97.0, 2.0, make_regime(Regime.BEAR, cfg), cfg) is None
    assert plan_long(100.0, 97.0, 2.0, make_regime(Regime.UNKNOWN, cfg), cfg) is None
    assert plan_short(100.0, 2.0, make_regime(Regime.UNKNOWN, cfg), cfg) is None


def test_shorts_in_bull_high_vix_follow_flag(cfg):
    assert plan_short(100.0, 2.0, make_regime(Regime.BULL_HIGH_VIX, cfg), cfg) is None
    allow = cfg.model_copy(update={"allow_shorts_in_bull_high_vix": True})
    assert plan_short(100.0, 2.0, make_regime(Regime.BULL_HIGH_VIX, allow), allow) is not None


def test_short_plan_basic(cfg):
    r = make_regime(Regime.BEAR, cfg)
    p = plan_short(close=100.0, atr14=2.0, regime=r, cfg=cfg)
    assert p.entry == pytest.approx(99.8)
    # candidates: pct 102.5, atr 99.8 + 3 = 102.8 -> tightest (lowest) = pct
    assert p.stop_rule is StopRule.PCT and p.stop == pytest.approx(102.5)
    assert p.target_1_price == pytest.approx(p.entry - 2 * p.r_value)
    assert p.target_2_price == pytest.approx(p.entry - 3 * p.r_value)
    assert p.target_1_price < p.entry and p.stop > p.entry


def test_weekly_trails_from_daily(fx, cfg):
    r = make_regime(Regime.BULL, cfg)
    daily = fx("long_vcp_ok")
    p = plan_long(float(daily["close"].iloc[-1]), float(daily["low"].iloc[-2]), 2.0, r, cfg, daily_for_weekly=daily)
    assert p.weekly_bars_available >= 30
    assert p.trail_weekly_ema is not None and p.trail_weekly_sma is not None
    assert p.trail_weekly_ema_len == 20 and p.trail_weekly_sma_len == 30


# ---------------------------------------------------------------- portfolio


def _cand(symbol, side, raw, qty, price, rps, sector="Tech"):
    from engine.types import TradePlan

    plan = TradePlan(
        side=side, entry=price, entry_max=price, stop=price - rps if side is Side.LONG else price + rps,
        stop_rule=StopRule.PCT, floor_applied=False, stop_candidates={}, stop_distance_pct=rps / price * 100,
        risk_per_share=rps, sizing_price=price, atr14=1.0, prev_bar_low=None, qty_raw=qty, qty_after_regime=qty,
        qty=qty, regime_multiplier=1.0, caps_applied=(), position_value=qty * price, risk_amount=qty * rps, r_value=rps,
    )
    score = ScoreBreakdown(side, raw, 105.0, raw / 105.0, min(raw, 100.0), Band.B, ())
    return Candidate(symbol=symbol, side=side, sector=sector, name=None, close=price, last_bar_date="2026-09-10", score=score, plan=plan)


def test_rank_sorts_and_caps_top_n(cfg):
    c = cfg.model_copy(update={"top_n_longs": 2})
    cands = [_cand("B", Side.LONG, 70, 10, 100, 2), _cand("A", Side.LONG, 70, 10, 100, 2), _cand("C", Side.LONG, 90, 10, 100, 2), _cand("Z", Side.LONG, 95, 0, 100, 2)]
    out = rank_candidates(cands, c)
    by = {x.symbol: x for x in out}
    assert by["C"].rank == 1 and by["A"].rank == 2  # tie broken by symbol
    assert by["B"].rank_status is RankStatus.NOT_IN_TOP_N
    assert by["Z"].rank is None and by["Z"].rank_reason == "no sized plan"


def test_portfolio_risk_ceiling_enforced(cfg):
    # each candidate risks 2% -> 10% ceiling allows 5; the 6th defers
    c = cfg.model_copy(update={"top_n_longs": 10, "max_concurrent_positions": 20, "max_positions_per_sector": 20})
    cands = [_cand(f"S{i}", Side.LONG, 90 - i, 100, 100.0, 100.0) for i in range(6)]  # risk 10000 each
    ranked = rank_candidates(cands, c)
    out, budget = apply_portfolio_constraints(ranked, [], c)
    statuses = [x.rank_status for x in out]
    assert statuses.count(RankStatus.RANKED) == 5
    assert statuses[-1] is RankStatus.DEFERRED_RISK_BUDGET
    assert budget.accepted_risk_amount == pytest.approx(50000)
    assert budget.accepted_risk_amount <= c.capital * c.max_portfolio_risk_pct / 100


def test_sector_and_position_caps_count_open_journal_positions(cfg):
    c = cfg.model_copy(update={"top_n_longs": 10})
    open_pos = [
        OpenPosition("HELD", Side.LONG, "Tech", 10, 100, 95, 1000, 50),
        OpenPosition("X2", Side.LONG, "Tech", 10, 100, 95, 1000, 50),
    ]
    cands = [_cand("NEWTECH", Side.LONG, 90, 10, 100, 2, "Tech"), _cand("HELD", Side.LONG, 88, 10, 100, 2, "Pharma"), _cand("OK", Side.LONG, 80, 10, 100, 2, "Pharma")]
    out, _ = apply_portfolio_constraints(rank_candidates(cands, c), open_pos, c)
    by = {x.symbol: x for x in out}
    assert by["NEWTECH"].rank_status is RankStatus.DEFERRED_SECTOR_CAP
    assert by["HELD"].rank_status is RankStatus.ALREADY_HELD
    assert by["OK"].rank_status is RankStatus.RANKED


def test_max_concurrent_positions(cfg):
    c = cfg.model_copy(update={"max_concurrent_positions": 1, "top_n_longs": 5, "max_positions_per_sector": 5})
    cands = [_cand("A", Side.LONG, 90, 10, 100, 2), _cand("B", Side.LONG, 80, 10, 100, 2)]
    out, _ = apply_portfolio_constraints(rank_candidates(cands, c), [], c)
    by = {x.symbol: x for x in out}
    assert by["A"].rank_status is RankStatus.RANKED and by["B"].rank_status is RankStatus.DEFERRED_MAX_POSITIONS


def test_gross_exposure_cap(cfg):
    c = cfg.model_copy(update={"max_gross_exposure_pct": 30.0, "top_n_longs": 5, "max_positions_per_sector": 5})
    # each position value 100000 = 20% of capital -> second one breaches 30%
    cands = [_cand("A", Side.LONG, 90, 1000, 100.0, 1.0), _cand("B", Side.LONG, 80, 1000, 100.0, 1.0)]
    out, budget = apply_portfolio_constraints(rank_candidates(cands, c), [], c)
    by = {x.symbol: x for x in out}
    assert by["B"].rank_status is RankStatus.DEFERRED_GROSS_EXPOSURE
    assert budget.accepted_gross_value <= c.capital * 0.30
