"""Deterministic setup quality grading: A++ / A+ / A / B+ / B.

No modelled likelihood figure is computed anywhere. The grade is a transparent function of
(raw score, regime alignment, fundamentals strength for longs) so every grade a user
sees can be explained by the `reasons` tuple. This intentionally replaces the reference
notebook's uncalibrated score-to-percentage formula (see README "Deviations") with
something that can be checked by hand instead of taken on faith.
"""

from __future__ import annotations

from .config import ScanConfig
from .types import Fundamentals, Grade, GradeResult, Regime, RegimeAlignment, Side


def regime_alignment(side: Side, regime: Regime) -> RegimeAlignment:
    if side is Side.LONG:
        if regime is Regime.BULL:
            return RegimeAlignment.FULL
        if regime in (Regime.NEUTRAL, Regime.BULL_HIGH_VIX):
            return RegimeAlignment.PARTIAL
        return RegimeAlignment.NONE
    if regime is Regime.BEAR:
        return RegimeAlignment.FULL
    if regime in (Regime.NEUTRAL, Regime.BULL_HIGH_VIX):
        return RegimeAlignment.PARTIAL
    return RegimeAlignment.NONE


def fundamentals_strong(f: Fundamentals | None, cfg: ScanConfig) -> bool | None:
    """None when there isn't enough data to judge (fields missing)."""
    if f is None:
        return None
    checks = [f.revenue_growth, f.eps_growth, f.roe, f.fcf_positive]
    if any(c is None for c in checks):
        return None
    return (
        f.revenue_growth >= cfg.grade_fund_revenue_growth_min
        and f.eps_growth >= cfg.grade_fund_eps_growth_min
        and f.roe >= cfg.grade_fund_roe_min
        and bool(f.fcf_positive)
    )


def grade_candidate(raw_score: float, side: Side, regime: Regime, fundamentals: Fundamentals | None, cfg: ScanConfig) -> GradeResult:
    align = regime_alignment(side, regime)
    # Shorts have no fundamentals gate in this system (liquidity only), so "strong fundamentals"
    # is not part of a short's grade — only score and regime alignment matter.
    strong = fundamentals_strong(fundamentals, cfg) if side is Side.LONG else None
    reasons: list[str] = [f"raw score {raw_score:g}", f"regime alignment: {align.value}"]
    if side is Side.LONG:
        reasons.append("fundamentals strong" if strong else ("fundamentals data incomplete" if strong is None else "fundamentals not top-tier"))

    if raw_score >= cfg.grade_app_min and align is RegimeAlignment.FULL and (side is Side.SHORT or strong is True):
        grade = Grade.A_PLUS_PLUS
    elif raw_score >= cfg.grade_ap_min and align in (RegimeAlignment.FULL, RegimeAlignment.PARTIAL):
        grade = Grade.A_PLUS
    elif raw_score >= cfg.grade_a_min:
        grade = Grade.A
    elif raw_score >= cfg.grade_bp_min:
        grade = Grade.B_PLUS
    else:
        grade = Grade.B
    reasons.append(f"-> {grade.value}")
    return GradeResult(grade=grade, alignment=align, fundamentals_strong=strong, reasons=tuple(reasons))
