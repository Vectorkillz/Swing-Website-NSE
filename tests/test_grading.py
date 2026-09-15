"""Deterministic quality grade: no modelled probability anywhere (see engine/grading.py docstring)."""

import pytest

from engine.grading import fundamentals_strong, grade_candidate, regime_alignment
from engine.types import Fundamentals, Grade, Regime, RegimeAlignment, Side

STRONG = Fundamentals(revenue_growth=25.0, eps_growth=30.0, roe=22.0, fcf_positive=True)
WEAK = Fundamentals(revenue_growth=9.0, eps_growth=11.0, roe=12.0, fcf_positive=True)
MISSING = Fundamentals(revenue_growth=25.0, eps_growth=None, roe=22.0, fcf_positive=True)


def test_regime_alignment_table(cfg):
    assert regime_alignment(Side.LONG, Regime.BULL) is RegimeAlignment.FULL
    assert regime_alignment(Side.LONG, Regime.NEUTRAL) is RegimeAlignment.PARTIAL
    assert regime_alignment(Side.LONG, Regime.BULL_HIGH_VIX) is RegimeAlignment.PARTIAL
    assert regime_alignment(Side.LONG, Regime.BEAR) is RegimeAlignment.NONE
    assert regime_alignment(Side.SHORT, Regime.BEAR) is RegimeAlignment.FULL
    assert regime_alignment(Side.SHORT, Regime.NEUTRAL) is RegimeAlignment.PARTIAL
    assert regime_alignment(Side.SHORT, Regime.BULL) is RegimeAlignment.NONE


def test_fundamentals_strong(cfg):
    assert fundamentals_strong(STRONG, cfg) is True
    assert fundamentals_strong(WEAK, cfg) is False
    assert fundamentals_strong(MISSING, cfg) is None
    assert fundamentals_strong(None, cfg) is None


def test_long_app_needs_score_alignment_and_fundamentals(cfg):
    g = grade_candidate(90.0, Side.LONG, Regime.BULL, STRONG, cfg)
    assert g.grade is Grade.A_PLUS_PLUS and g.alignment is RegimeAlignment.FULL and g.fundamentals_strong is True


def test_long_high_score_but_neutral_regime_is_not_app(cfg):
    g = grade_candidate(90.0, Side.LONG, Regime.NEUTRAL, STRONG, cfg)
    assert g.grade is Grade.A_PLUS  # needs FULL alignment for A++, NEUTRAL is only PARTIAL


def test_long_high_score_but_weak_fundamentals_is_not_app(cfg):
    g = grade_candidate(90.0, Side.LONG, Regime.BULL, WEAK, cfg)
    assert g.grade is Grade.A_PLUS


def test_long_missing_fundamentals_cannot_reach_app(cfg):
    g = grade_candidate(95.0, Side.LONG, Regime.BULL, MISSING, cfg)
    assert g.grade is Grade.A_PLUS and g.fundamentals_strong is None


@pytest.mark.parametrize("score,grade", [(85, Grade.A_PLUS_PLUS), (75, Grade.A_PLUS), (65, Grade.A), (50, Grade.B_PLUS), (49.9, Grade.B)])
def test_score_thresholds_for_short_in_full_alignment(cfg, score, grade):
    g = grade_candidate(score, Side.SHORT, Regime.BEAR, None, cfg)
    assert g.grade is grade


def test_short_never_needs_fundamentals(cfg):
    g = grade_candidate(95.0, Side.SHORT, Regime.BEAR, None, cfg)
    assert g.grade is Grade.A_PLUS_PLUS and g.fundamentals_strong is None


def test_short_in_bull_high_vix_is_only_partial_alignment(cfg):
    allow = cfg.model_copy(update={"allow_shorts_in_bull_high_vix": True})
    g = grade_candidate(90.0, Side.SHORT, Regime.BULL_HIGH_VIX, None, allow)
    assert g.grade is Grade.A_PLUS and g.alignment is RegimeAlignment.PARTIAL
