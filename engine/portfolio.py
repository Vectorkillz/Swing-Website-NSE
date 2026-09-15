"""Ranking and portfolio-level constraints.

`apply_portfolio_constraints` is ported line-for-line to web/src/lib/portfolio.ts and
both are checked against shared vectors (data/test_vectors/portfolio_constraints.json).
All money arithmetic is done in integer paise so Python and JavaScript agree exactly.
"""

from __future__ import annotations

from dataclasses import replace

from .config import ScanConfig
from .types import Candidate, OpenPosition, PortfolioBudget, RankStatus, Side


def paise(x: float) -> int:
    return int(round(x * 100))


def rank_candidates(cands: list[Candidate], cfg: ScanConfig) -> list[Candidate]:
    """Sort by raw score desc (symbol asc for deterministic ties); keep top N per side.
    Candidates without a sized plan (qty 0 or no plan) are not ranked."""
    out: list[Candidate] = []
    for side, top_n in ((Side.LONG, cfg.top_n_longs), (Side.SHORT, cfg.top_n_shorts)):
        pool = [c for c in cands if c.side is side]
        pool.sort(key=lambda c: (-c.score.raw, c.symbol))
        kept = 0
        for c in pool:
            if c.plan is None or c.plan.qty <= 0:
                out.append(replace(c, rank=None, rank_status=None, rank_reason="no sized plan"))
                continue
            if kept < top_n:
                kept += 1
                out.append(replace(c, rank=kept, rank_status=RankStatus.RANKED, rank_reason=None))
            else:
                out.append(replace(c, rank=None, rank_status=RankStatus.NOT_IN_TOP_N, rank_reason=f"outside top {top_n}"))
    return out


def apply_portfolio_constraints(
    ranked: list[Candidate], open_positions: list[OpenPosition], cfg: ScanConfig
) -> tuple[list[Candidate], PortfolioBudget]:
    """Walk ranked candidates in rank order and accept while all caps hold.

    Deferred candidates keep their rank but get a `deferred_*` status and reason.
    Order: longs then shorts by rank (the same order the TS port uses).
    """
    cap_p = paise(cfg.capital)
    gross_cap = cap_p * cfg.max_gross_exposure_pct / 100.0
    risk_cap = cap_p * cfg.max_portfolio_risk_pct / 100.0
    gross_cap_p = int(round(gross_cap))
    risk_cap_p = int(round(risk_cap))

    open_gross = sum(paise(p.position_value) for p in open_positions)
    open_risk = sum(paise(p.risk_amount) for p in open_positions)
    positions = len(open_positions)
    per_sector: dict[str, int] = {}
    held: set[str] = set()
    for p in open_positions:
        per_sector[p.sector or "UNKNOWN"] = per_sector.get(p.sector or "UNKNOWN", 0) + 1
        held.add(p.symbol)

    gross = open_gross
    risk = open_risk
    acc_gross = 0
    acc_risk = 0
    acc_n = 0

    def order_key(c: Candidate):
        return (0 if c.side is Side.LONG else 1, c.rank if c.rank is not None else 10**9, c.symbol)

    result: list[Candidate] = []
    for c in sorted(ranked, key=order_key):
        if c.rank_status is not RankStatus.RANKED or c.plan is None:
            result.append(c)
            continue
        sector = c.sector or "UNKNOWN"
        pv = paise(c.plan.position_value)
        ra = paise(c.plan.risk_amount)
        if c.symbol in held and c.side is Side.LONG and not cfg.allow_pyramiding:
            result.append(replace(c, rank_status=RankStatus.ALREADY_HELD, rank_reason="open position exists and allow_pyramiding=false"))
            continue
        if positions + 1 > cfg.max_concurrent_positions:
            result.append(replace(c, rank_status=RankStatus.DEFERRED_MAX_POSITIONS, rank_reason=f"max_concurrent_positions {cfg.max_concurrent_positions} reached"))
            continue
        if per_sector.get(sector, 0) + 1 > cfg.max_positions_per_sector:
            result.append(replace(c, rank_status=RankStatus.DEFERRED_SECTOR_CAP, rank_reason=f"max_positions_per_sector {cfg.max_positions_per_sector} reached for {sector}"))
            continue
        if gross + pv > gross_cap_p:
            result.append(replace(c, rank_status=RankStatus.DEFERRED_GROSS_EXPOSURE, rank_reason=f"gross exposure would exceed {cfg.max_gross_exposure_pct:g}% of capital"))
            continue
        if risk + ra > risk_cap_p:
            result.append(replace(c, rank_status=RankStatus.DEFERRED_RISK_BUDGET, rank_reason=f"portfolio risk would exceed {cfg.max_portfolio_risk_pct:g}% of capital"))
            continue
        gross += pv
        risk += ra
        acc_gross += pv
        acc_risk += ra
        acc_n += 1
        positions += 1
        per_sector[sector] = per_sector.get(sector, 0) + 1
        held.add(c.symbol)
        result.append(c)

    budget = PortfolioBudget(
        capital=cfg.capital,
        open_positions=len(open_positions),
        open_gross_value=open_gross / 100.0,
        open_risk_amount=open_risk / 100.0,
        accepted_positions=acc_n,
        accepted_gross_value=acc_gross / 100.0,
        accepted_risk_amount=acc_risk / 100.0,
        gross_cap=gross_cap_p / 100.0,
        risk_cap=risk_cap_p / 100.0,
        per_sector=dict(sorted(per_sector.items())),
    )
    # restore original order (by side then rank/symbol) for stable output
    result.sort(key=order_key)
    return result, budget
