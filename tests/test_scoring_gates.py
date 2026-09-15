import pytest

from engine.config import ScanConfig
from engine.gates import long_gate, short_gate
from engine.scoring import LongFeatures, band_for, score_long, score_short
from engine.types import Band, BarPattern, Fundamentals, MomentumLeg, ShortSignals, VcpResult


def feats(**kw):
    base = dict(
        leg=MomentumLeg(found=True, move_pct=25.0, max_daily_pct=3.0),
        vcp=VcpResult(valid=True, depth_pct=12.0, depth_ok=True, vol_dry_pct=30.0, vol_dry_ok=True, above_ema20=True, above_ema50=True, stage2=True),
        bar_pattern=BarPattern(kind="IB", trigger=100.0),
        colour_change=True,
        rs_vs_nifty=5.0,
        fundamentals=Fundamentals(revenue_growth=25.0, eps_growth=30.0, roe=22.0, fcf_positive=True),
    )
    base.update(kw)
    return LongFeatures(**base)


def test_long_max_is_105_and_not_clipped_in_raw(cfg):
    sc = score_long(feats(), cfg)
    assert sc.raw == 105.0
    assert sc.max_possible == 105.0
    assert sc.normalised == pytest.approx(1.0)
    assert sc.display == 100.0  # clip flag on (reference behaviour)
    assert sc.band is Band.A
    unclipped = cfg.model_copy(update={"clip_score_display_at_100": False})
    assert score_long(feats(), unclipped).display == 105.0


def test_long_component_table(cfg):
    comps = {c.rule_id: c for c in score_long(feats(), cfg).components}
    assert comps["trend"].points == 20 and comps["momentum"].points == 20
    assert comps["vcp_depth"].points == 10 and comps["volume_dry"].points == 10
    assert comps["entry_pattern"].points == 10 and comps["colour_change"].points == 5
    assert comps["revenue_growth"].points == 8 and comps["eps_growth"].points == 8
    assert comps["roe"].points == 7 and comps["fcf_positive"].points == 7
    assert comps["rs_vs_nifty"].points == 0 and comps["rs_vs_nifty"].max_points == 0


@pytest.mark.parametrize("depth,pts", [(8.0, 10), (15.0, 10), (15.01, 7), (20.0, 7), (20.01, 4), (24.9, 4)])
def test_depth_boundaries(cfg, depth, pts):
    v = VcpResult(valid=True, depth_pct=depth, depth_ok=True, vol_dry_pct=30, vol_dry_ok=True, above_ema20=True)
    comps = {c.rule_id: c for c in score_long(feats(vcp=v), cfg).components}
    assert comps["vcp_depth"].points == pts


@pytest.mark.parametrize("vol,pts", [(34.9, 10), (35.0, 7), (49.9, 7), (50.0, 3), (69.9, 3), (70.0, 0)])
def test_volume_dry_boundaries(cfg, vol, pts):
    v = VcpResult(valid=True, depth_pct=12, depth_ok=True, vol_dry_pct=vol, vol_dry_ok=vol < 50, above_ema20=True)
    comps = {c.rule_id: c for c in score_long(feats(vcp=v), cfg).components}
    assert comps["volume_dry"].points == pts


def test_momentum_fallback_to_daily_candle(cfg):
    leg = MomentumLeg(found=True, move_pct=10.0, max_daily_pct=7.0)
    comps = {c.rule_id: c for c in score_long(feats(leg=leg), cfg).components}
    assert comps["momentum"].points == 12


def test_trend_partial_credit(cfg):
    v = VcpResult(valid=True, depth_pct=12, depth_ok=True, vol_dry_pct=30, vol_dry_ok=True, above_ema20=True, above_ema50=True, stage2=False)
    comps = {c.rule_id: c for c in score_long(feats(vcp=v), cfg).components}
    assert comps["trend"].points == 10


def test_missing_fundamentals_score_zero_not_negative(cfg):
    sc = score_long(feats(fundamentals=None), cfg)
    assert sc.raw == 75.0
    for c in sc.components:
        if c.rule_id in ("revenue_growth", "eps_growth", "roe", "fcf_positive"):
            assert c.points == 0 and c.detail == "missing"


def test_rs_weight_enables_component(cfg):
    on = cfg.model_copy(update={"rs_score_weight": 5.0})
    sc = score_long(feats(), on)
    assert sc.raw == 110.0 and sc.max_possible == 110.0


def test_short_score_table(cfg):
    s = ShortSignals(True, True, True, True, True, True, "single_bar_high", bounce_ratio=0.1)
    sc = score_short(s, cfg)
    assert sc.raw == 100.0 and sc.max_possible == 100.0
    s2 = ShortSignals(True, True, False, False, False, False, "single_bar_high")
    assert score_short(s2, cfg).raw == 45.0


def test_bands(cfg):
    assert band_for(85, cfg) is Band.A
    assert band_for(84.9, cfg) is Band.B
    assert band_for(69.9, cfg) is Band.C


# ---------------------------------------------------------------- gates


def test_long_gate_passes_good(good_fundamentals, cfg):
    assert long_gate(good_fundamentals, cfg).passed


def test_long_gate_fail_reason_names_field(good_fundamentals, cfg):
    f = Fundamentals(**{**good_fundamentals.__dict__, "debt_equity": 3.1})
    g = long_gate(f, cfg)
    assert not g.passed and g.reason.startswith("debt_equity")


def test_missing_field_policy_is_uniform(good_fundamentals, cfg):
    """Defect 7.3: a missing D/E and a missing ROE must be treated identically."""
    no_de = Fundamentals(**{**good_fundamentals.__dict__, "debt_equity": None})
    no_roe = Fundamentals(**{**good_fundamentals.__dict__, "roe": None})
    for policy, expect in (("reject", False), ("pass", True)):
        c = cfg.model_copy(update={"treat_missing_fundamental_as": policy})
        assert long_gate(no_de, c).passed is expect
        assert long_gate(no_roe, c).passed is expect
    c = cfg.model_copy(update={"treat_missing_fundamental_as": "exclude"})
    g = long_gate(no_de, c)
    assert not g.passed and g.excluded
    checks = {ch.field: ch.outcome for ch in g.checks}
    assert checks["debt_equity"] == "missing"


def test_absent_fundamentals_object(cfg):
    assert not long_gate(None, cfg).passed
    assert long_gate(None, cfg.model_copy(update={"treat_missing_fundamental_as": "pass"})).passed


def test_short_gate_half_volume(cfg):
    assert short_gate(Fundamentals(avg_volume=150000), cfg).passed
    assert not short_gate(Fundamentals(avg_volume=149999), cfg).passed
