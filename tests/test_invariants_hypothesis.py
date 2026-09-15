"""Property-based tests for the Section 8 safety invariants (1, 2, 3, 6, 7)."""

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
mult = st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False)


@settings(max_examples=400, deadline=None)
@given(close=price, atr_frac=frac, low_frac=frac)
def test_long_plan_invariants(close, atr_frac, low_frac):
    atr = close * atr_frac * 0.2  # ATR up to 20% of price
    prev_low = close * (0.8 + 0.25 * low_frac)  # prev low may even be above the close
    p = plan_long(close, prev_low, atr, BULL, CFG)
    assert p is not None
    assert p.risk_per_share > 0  # invariant 1
    assert p.stop_distance_pct >= CFG.min_stop_distance_pct - 1e-9  # invariant 2
    assert p.position_value <= CFG.capital * CFG.max_position_pct_of_capital / 100 + 1e-6  # invariant 3
    assert p.stop < p.entry  # invariant 6
    assert p.partial_1_price > p.entry and p.partial_2_price > p.entry and p.breakeven_trigger > p.entry  # 7
    assert p.risk_amount <= CFG.capital * CFG.risk_per_trade_pct / 100 + 1e-6
    assert p.entry <= p.entry_max


@settings(max_examples=400, deadline=None)
@given(close=price, atr_frac=frac)
def test_short_plan_invariants(close, atr_frac):
    atr = close * atr_frac * 0.2
    p = plan_short(close, atr, BEAR, CFG)
    assert p is not None
    assert p.risk_per_share > 0
    assert p.stop_distance_pct >= CFG.min_stop_distance_pct - 1e-9
    assert p.position_value <= CFG.capital * CFG.max_position_pct_of_capital / 100 + 1e-6
    assert p.stop > p.entry
    assert p.target_1_price < p.entry and p.target_2_price < p.entry
    assert p.risk_amount <= CFG.capital * CFG.risk_per_trade_pct / 100 + 1e-6


@settings(max_examples=200, deadline=None)
@given(close=price, atr_frac=frac, low_frac=frac, floor=st.floats(min_value=0.1, max_value=5.0), cap=st.floats(min_value=1.0, max_value=100.0))
def test_long_invariants_hold_for_other_configs(close, atr_frac, low_frac, floor, cap):
    cfg = ScanConfig(min_stop_distance_pct=floor, max_position_pct_of_capital=cap)
    p = plan_long(close, close * (0.8 + 0.25 * low_frac), close * atr_frac * 0.2, make_regime(Regime.NEUTRAL, cfg), cfg)
    assert p.risk_per_share > 0
    assert p.stop_distance_pct >= floor - 1e-9
    assert p.position_value <= cfg.capital * cap / 100 + 1e-6
    assert p.stop < p.entry
