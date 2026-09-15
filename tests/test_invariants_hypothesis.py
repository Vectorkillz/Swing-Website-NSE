"""Property-based tests for the plan invariants: positive R, stop floor, level ordering, minimum reward:risk."""

from hypothesis import given, settings
from hypothesis import strategies as st

from engine.config import ScanConfig
from engine.risk import plan_long, plan_short
from engine.types import Regime
from tests.conftest import make_regime

CFG = ScanConfig()
BULL = make_regime(Regime.BULL, CFG)
BEAR = make_regime(Regime.BEAR, CFG)

price = st.floats(min_value=1.0, max_value=100000.0, allow_nan=False, allow_infinity=False)
frac = st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False)
maybe_level = st.one_of(st.none(), st.floats(min_value=0.5, max_value=2.0, allow_nan=False, allow_infinity=False))


@settings(max_examples=400, deadline=None)
@given(close=price, atr_frac=frac, low_frac=frac, leg_mult=maybe_level)
def test_long_plan_invariants(close, atr_frac, low_frac, leg_mult):
    atr = close * atr_frac * 0.2
    prev_low = close * (0.8 + 0.25 * low_frac)
    leg_high = None if leg_mult is None else close * leg_mult
    p = plan_long(close, prev_low, atr, BULL, CFG, leg_high=leg_high)
    assert p is not None
    assert p.r_value > 0
    assert p.stop_distance_pct >= CFG.min_stop_distance_pct - 1e-9
    assert p.stop < p.entry <= p.entry_max
    assert p.target > p.entry and p.extended_target > p.entry and p.breakeven_trigger > p.entry
    assert p.reward_risk >= CFG.target_min_rr - 1e-9


@settings(max_examples=400, deadline=None)
@given(close=price, atr_frac=frac, low_mult=maybe_level)
def test_short_plan_invariants(close, atr_frac, low_mult):
    atr = close * atr_frac * 0.2
    recent_low = None if low_mult is None else close * low_mult
    p = plan_short(close, atr, BEAR, CFG, recent_low=recent_low)
    assert p is not None
    assert p.r_value > 0
    assert p.stop_distance_pct >= CFG.min_stop_distance_pct - 1e-9
    assert p.target < p.entry < p.stop
    assert p.extended_target < p.entry
    assert p.reward_risk >= CFG.target_min_rr - 1e-9


@settings(max_examples=200, deadline=None)
@given(close=price, atr_frac=frac, low_frac=frac, floor=st.floats(min_value=0.1, max_value=5.0), min_rr=st.floats(min_value=0.5, max_value=2.0))
def test_long_invariants_hold_for_other_configs(close, atr_frac, low_frac, floor, min_rr):
    cfg = ScanConfig(min_stop_distance_pct=floor, target_min_rr=min_rr, target_fallback_r=max(2.0, min_rr))
    p = plan_long(close, close * (0.8 + 0.25 * low_frac), close * atr_frac * 0.2, make_regime(Regime.NEUTRAL, cfg), cfg, leg_high=close * 1.05)
    assert p.r_value > 0
    assert p.stop_distance_pct >= floor - 1e-9
    assert p.stop < p.entry < p.target
    assert p.reward_risk >= min_rr - 1e-9
