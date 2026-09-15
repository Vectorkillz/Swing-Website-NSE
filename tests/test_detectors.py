import pandas as pd
import pytest

from engine.config import ScanConfig
from engine.detectors import colour_change, detect_bar_pattern, momentum_leg, rs_vs_index, short_signals, vcp
from engine.indicators import add_indicators


def prep(fx, name):
    return add_indicators(fx(name))


def test_momentum_leg_found_and_window_fields(fx, cfg):
    df = prep(fx, "long_vcp_ok")
    leg = momentum_leg(df, cfg)
    assert leg.found and leg.qualifies_by_move
    assert leg.end_idx - leg.start_idx == cfg.leg_window_bars - 1
    assert leg.age_bars == len(df) - 1 - leg.end_idx
    assert leg.leg_high >= df["high"].iloc[leg.start_idx : leg.end_idx + 1].max() - 1e-9
    assert leg.start_date < leg.end_date


def test_momentum_leg_age_limit_flag(fx, cfg):
    df = prep(fx, "long_leg_stale")
    assert momentum_leg(df, cfg).found  # max_leg_age_bars=null: reference behaviour
    strict = cfg.model_copy(update={"max_leg_age_bars": 5})
    leg = momentum_leg(df, strict)
    assert not leg.found and leg.rejected_reason.startswith("leg_too_old")
    assert leg.age_bars > 5


def test_momentum_leg_rejects_flat_series(cfg):
    idx = pd.bdate_range(end="2026-09-10", periods=120)
    df = pd.DataFrame({"open": 100.0, "high": 101.0, "low": 99.0, "close": 100.0, "volume": 1000}, index=idx)
    leg = momentum_leg(add_indicators(df), cfg)
    assert not leg.found and leg.rejected_reason == "below_thresholds"


def test_vcp_valid_on_good_fixture(fx, cfg):
    df = prep(fx, "long_vcp_ok")
    v = vcp(df, momentum_leg(df, cfg), cfg)
    assert v.valid and v.depth_ok and v.vol_dry_ok and v.above_ema20 and v.stage2
    assert cfg.vcp_depth_min <= v.depth_pct <= cfg.vcp_depth_max
    assert v.vol_dry_pct < cfg.volume_dry_pct


def test_vcp_rejects_shallow_pullback(fx, cfg):
    df = prep(fx, "long_no_pullback")
    v = vcp(df, momentum_leg(df, cfg), cfg)
    assert not v.valid and not v.depth_ok and v.depth_pct < cfg.vcp_depth_min


def test_inside_bar_trigger_is_mother_high(fx, cfg):
    df = prep(fx, "long_vcp_ok")
    bp = detect_bar_pattern(df, cfg)
    assert bp.kind == "IB"
    assert bp.trigger == pytest.approx(df["high"].iloc[bp.bar_idx - 1])
    assert df["high"].iloc[bp.bar_idx] < bp.trigger


def test_mother_bar_detected(fx, cfg):
    df = prep(fx, "long_mother_bar")
    bp = detect_bar_pattern(df, cfg)
    assert bp.kind == "MB"
    assert bp.trigger == pytest.approx(df["high"].iloc[bp.bar_idx])


def test_colour_change(fx):
    assert colour_change(prep(fx, "long_colour_change"))
    assert not colour_change(prep(fx, "long_mother_bar"))


def test_rs_vs_index():
    a = pd.Series([100.0, 110.0, 121.0])
    b = pd.Series([100.0, 100.0, 105.0])
    assert rs_vs_index(a, b, 2) == pytest.approx(21.0 - 5.0)
    assert rs_vs_index(a, None, 2) is None


def test_short_downtrend_fixture(fx, cfg):
    s = short_signals(prep(fx, "short_stage4_downtrend"), cfg)
    assert s.stage4 and s.downtrend and s.weak_bounce and s.low_vol_bounce and s.red_confirm
    assert s.weak_bounce_method == "single_bar_high"


def test_short_double_top_fixture(fx, cfg):
    s = short_signals(prep(fx, "short_double_top"), cfg)
    assert s.stage4 and s.double_top
    assert abs(s.double_top_peak1 - s.double_top_peak2) / max(s.double_top_peak1, s.double_top_peak2) * 100 < cfg.double_top_tolerance_pct


def test_short_swing_high_method_runs(fx, cfg):
    alt = cfg.model_copy(update={"weak_bounce_method": "swing_high"})
    s = short_signals(prep(fx, "short_stage4_downtrend"), alt)
    assert s.weak_bounce_method == "swing_high"
    assert s.bounce_ratio is None or s.bounce_ratio < 1.0


def test_short_needs_60_bars(fx, cfg):
    assert short_signals(prep(fx, "short_stage4_downtrend").iloc[-50:], cfg) is None


def test_long_fixture_is_not_a_short(fx, cfg):
    s = short_signals(prep(fx, "long_vcp_ok"), cfg)
    assert not s.stage4
