"""Score bands and empirical outcome statistics.

No modelled percentage is ever produced. Until `min_samples_for_calibration` closed
trades exist, only the raw score, normalised score and an ordinal band are shown.
Afterwards `decile_stats` summarises what actually happened, labelled with n.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from .config import ScanConfig
from .scoring import band_for  # re-export for callers


@dataclass(frozen=True)
class ClosedTrade:
    score_raw: float
    realised_r: float


@dataclass(frozen=True)
class DecileStat:
    decile: int  # 1..10 by raw score within [0, max_possible]
    score_min: float
    score_max: float
    n: int
    hit_rate: float | None  # share of trades with realised_r > 0
    avg_r: float | None


def calibration_ready(closed: Sequence[ClosedTrade], cfg: ScanConfig) -> bool:
    return len(closed) >= cfg.min_samples_for_calibration


def decile_stats(closed: Sequence[ClosedTrade], max_possible: float) -> list[DecileStat]:
    width = max_possible / 10.0
    out: list[DecileStat] = []
    for d in range(1, 11):
        lo, hi = (d - 1) * width, d * width
        bucket = [t for t in closed if (lo <= t.score_raw < hi) or (d == 10 and t.score_raw >= hi)]
        n = len(bucket)
        hit = (sum(1 for t in bucket if t.realised_r > 0) / n) if n else None
        avg = (sum(t.realised_r for t in bucket) / n) if n else None
        out.append(DecileStat(d, lo, hi, n, hit, avg))
    return out


__all__ = ["ClosedTrade", "DecileStat", "band_for", "calibration_ready", "decile_stats"]
