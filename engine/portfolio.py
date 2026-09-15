"""Ranking only. Position sizing and portfolio caps were removed in schema v2."""

from __future__ import annotations

from dataclasses import replace

from .config import ScanConfig
from .types import Candidate, RankStatus, Side


def rank_candidates(cands: list[Candidate], cfg: ScanConfig) -> list[Candidate]:
    """Sort by raw score desc (symbol asc on ties); mark top N per side. Candidates without a plan are unranked."""
    out: list[Candidate] = []
    for side, top_n in ((Side.LONG, cfg.top_n_longs), (Side.SHORT, cfg.top_n_shorts)):
        pool = [c for c in cands if c.side is side]
        pool.sort(key=lambda c: (-c.score.raw, c.symbol))
        kept = 0
        for c in pool:
            if c.plan is None:
                out.append(replace(c, rank=None, rank_status=None, rank_reason="no plan"))
            elif kept < top_n:
                kept += 1
                out.append(replace(c, rank=kept, rank_status=RankStatus.RANKED, rank_reason=None))
            else:
                out.append(replace(c, rank=None, rank_status=RankStatus.NOT_IN_TOP_N, rank_reason=f"outside top {top_n}"))
    return out
