"""Seeded test vectors for apply_portfolio_constraints, shared with the TypeScript port."""

from __future__ import annotations

import random

from engine.canonical import to_jsonable
from engine.config import ScanConfig
from engine.portfolio import apply_portfolio_constraints, rank_candidates
from engine.types import Band, Candidate, OpenPosition, ScoreBreakdown, Side, StopRule, TradePlan

SECTORS = ["Tech", "Pharma", "Banks", "Auto", "Energy"]


def _cand(rng: random.Random, i: int, side: Side) -> Candidate:
    price = round(rng.uniform(50, 3000), 2)
    rps = round(price * rng.uniform(0.01, 0.05), 2)
    qty = rng.randint(0, 400)
    plan = TradePlan(
        side=side, entry=price, entry_max=price, stop=price - rps if side is Side.LONG else price + rps,
        stop_rule=StopRule.PCT, floor_applied=False, stop_candidates={}, stop_distance_pct=rps / price * 100,
        risk_per_share=rps, sizing_price=price, atr14=1.0, prev_bar_low=None, qty_raw=qty, qty_after_regime=qty, qty=qty,
        regime_multiplier=1.0, caps_applied=(), position_value=round(qty * price, 2), risk_amount=round(qty * rps, 2), r_value=rps,
    )
    raw = float(rng.randint(60, 105))
    return Candidate(
        symbol=f"SYM{i:02d}", side=side, sector=rng.choice(SECTORS), name=None, close=price, last_bar_date="2026-09-10",
        score=ScoreBreakdown(side, raw, 105.0, raw / 105.0, min(raw, 100.0), Band.B, ()), plan=plan,
    )


def _slim(c: Candidate) -> dict:
    return {
        "symbol": c.symbol, "side": c.side.value, "sector": c.sector, "raw": c.score.raw,
        "qty": c.plan.qty, "position_value": c.plan.position_value, "risk_amount": c.plan.risk_amount,
    }


def generate(n_cases: int = 40) -> dict:
    rng = random.Random(20260910)
    cases = []
    for k in range(n_cases):
        cfg = ScanConfig(
            capital=rng.choice([300000, 500000, 1000000]),
            max_portfolio_risk_pct=rng.choice([4.0, 6.0, 10.0]),
            max_gross_exposure_pct=rng.choice([40.0, 60.0, 100.0]),
            max_concurrent_positions=rng.randint(2, 8),
            max_positions_per_sector=rng.randint(1, 3),
            allow_pyramiding=rng.random() < 0.3,
            top_n_longs=rng.randint(1, 6),
            top_n_shorts=rng.randint(0, 4),
        )
        cands = [_cand(rng, i, Side.LONG if i % 3 else Side.SHORT) for i in range(rng.randint(3, 12))]
        opens = []
        for j in range(rng.randint(0, 3)):
            sym = rng.choice([c.symbol for c in cands]) if rng.random() < 0.5 else f"OPEN{j}"
            price = round(rng.uniform(50, 3000), 2)
            qty = rng.randint(1, 200)
            opens.append(OpenPosition(sym, Side.LONG, rng.choice(SECTORS), qty, price, price * 0.97, round(qty * price, 2), round(qty * price * 0.03, 2)))
        ranked = rank_candidates(cands, cfg)
        out, budget = apply_portfolio_constraints(ranked, opens, cfg)
        cases.append(
            {
                "case": k,
                "config": {
                    "capital": cfg.capital, "max_portfolio_risk_pct": cfg.max_portfolio_risk_pct, "max_gross_exposure_pct": cfg.max_gross_exposure_pct,
                    "max_concurrent_positions": cfg.max_concurrent_positions, "max_positions_per_sector": cfg.max_positions_per_sector,
                    "allow_pyramiding": cfg.allow_pyramiding, "top_n_longs": cfg.top_n_longs, "top_n_shorts": cfg.top_n_shorts,
                },
                "candidates": [_slim(c) for c in cands],
                "open_positions": to_jsonable(opens),
                "expected": {
                    "results": [{"symbol": c.symbol, "side": c.side.value, "rank": c.rank, "rank_status": c.rank_status.value if c.rank_status else None} for c in out],
                    "budget": to_jsonable(budget),
                },
            }
        )
    return {"schema_version": 1, "cases": cases}
