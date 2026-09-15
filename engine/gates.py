"""Eligibility gates. Missing fields produce an explicit MISSING outcome handled uniformly
by `treat_missing_fundamental_as` (defect 7.3)."""

from __future__ import annotations

from typing import Callable

from .config import ScanConfig
from .types import Fundamentals, GateCheck, GateResult


def _check(field: str, value: float | None, threshold: float, op: str, cfg: ScanConfig) -> GateCheck:
    if value is None:
        return GateCheck(field=field, value=None, threshold=threshold, op=op, outcome="missing")
    ok = value >= threshold if op == ">=" else value <= threshold
    return GateCheck(field=field, value=float(value), threshold=threshold, op=op, outcome="pass" if ok else "fail")


def _resolve(checks: list[GateCheck], cfg: ScanConfig) -> GateResult:
    missing = [c for c in checks if c.outcome == "missing"]
    failed = [c for c in checks if c.outcome == "fail"]
    policy = cfg.treat_missing_fundamental_as
    if failed:
        c = failed[0]
        return GateResult(False, tuple(checks), f"{c.field} {c.value:g} not {c.op} {c.threshold:g}")
    if missing:
        names = ",".join(c.field for c in missing)
        if policy == "reject":
            return GateResult(False, tuple(checks), f"missing:{names} (treat_missing_fundamental_as=reject)")
        if policy == "exclude":
            return GateResult(False, tuple(checks), f"missing:{names} (excluded)", excluded=True)
        # pass
        return GateResult(True, tuple(checks), None)
    return GateResult(True, tuple(checks), None)


def long_gate(f: Fundamentals | None, cfg: ScanConfig) -> GateResult:
    if f is None:
        if cfg.treat_missing_fundamental_as == "pass":
            return GateResult(True, (), None)
        return GateResult(False, (), "fundamentals_absent", excluded=cfg.treat_missing_fundamental_as == "exclude")
    checks = [
        _check("market_cap_cr", f.market_cap_cr, cfg.min_market_cap_cr, ">=", cfg),
        _check("avg_volume", f.avg_volume, cfg.min_avg_volume, ">=", cfg),
        _check("debt_equity", f.debt_equity, cfg.max_debt_equity, "<=", cfg),
        _check("roe", f.roe, cfg.min_roe, ">=", cfg),
        _check("revenue_growth", f.revenue_growth, cfg.min_revenue_growth, ">=", cfg),
    ]
    return _resolve(checks, cfg)


def short_gate(f: Fundamentals | None, cfg: ScanConfig) -> GateResult:
    """Shorts only need liquidity: avg volume >= factor x min_avg_volume."""
    threshold = cfg.short_avg_volume_factor * cfg.min_avg_volume
    avg = None if f is None else f.avg_volume
    checks = [_check("avg_volume", avg, threshold, ">=", cfg)]
    return _resolve(checks, cfg)
