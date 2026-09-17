"""Data structures for all engine inputs and outputs (frozen dataclasses and enums)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from enum import Enum
from typing import Optional

import pandas as pd


class Regime(str, Enum):
    BULL = "BULL"
    BULL_HIGH_VIX = "BULL_HIGH_VIX"
    NEUTRAL = "NEUTRAL"
    BEAR = "BEAR"
    UNKNOWN = "UNKNOWN"


class Side(str, Enum):
    LONG = "long"
    SHORT = "short"


class StopRule(str, Enum):
    PCT = "pct"
    ATR = "atr"
    PREV_LOW = "prev_low"
    FLOOR = "floor"


class TargetRule(str, Enum):
    STRUCTURE = "structure"   # leg high (long) / lowest low (short)
    MIN_RR = "min_rr"         # structural level too close (below target_min_rr); target_fallback_r x R used instead
    FALLBACK = "fallback"     # no structural level beyond entry; target_fallback_r x R


class CapBucket(str, Enum):
    LARGE = "large"
    MID = "mid"
    SMALL = "small"
    MICRO = "micro"
    UNKNOWN = "unknown"


class MultibaggerLevel(str, Enum):
    STRONG = "strong"
    WATCH = "watch"
    NONE = "none"


class SymbolOutcome(str, Enum):
    DATA_UNAVAILABLE = "data_unavailable"
    FUNDAMENTALS_MISSING = "fundamentals_missing"
    BANNED = "banned"
    REJECTED_GATE = "rejected_gate"
    NO_SETUP = "no_setup"
    BELOW_MIN_SCORE = "below_min_score"
    NO_PLAN = "no_plan"
    CANDIDATE = "candidate"


class RankStatus(str, Enum):
    RANKED = "ranked"
    NOT_IN_TOP_N = "not_in_top_n"


class Band(str, Enum):
    A = "A"
    B = "B"
    C = "C"


class Grade(str, Enum):
    """Deterministic quality grade: raw score + regime alignment + (for longs) fundamentals
    strength. No modelled likelihood figure is ever computed or displayed (see engine/grading.py)."""

    A_PLUS_PLUS = "A++"
    A_PLUS = "A+"
    A = "A"
    B_PLUS = "B+"
    B = "B"


class RegimeAlignment(str, Enum):
    FULL = "full"        # long in BULL, short in BEAR
    PARTIAL = "partial"  # long/short in NEUTRAL or BULL_HIGH_VIX (if shorts allowed there)
    NONE = "none"        # side not allowed in this regime (should not normally reach grading)


@dataclass(frozen=True)
class Fundamentals:
    """Provider-normalised fundamentals. None means MISSING.
    Units: market_cap_cr INR crore; debt_equity RATIO; roe, revenue_growth, eps_growth percent."""

    market_cap_cr: Optional[float] = None
    avg_volume: Optional[float] = None
    debt_equity: Optional[float] = None
    roe: Optional[float] = None
    revenue_growth: Optional[float] = None
    eps_growth: Optional[float] = None
    fcf_positive: Optional[bool] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    name: Optional[str] = None
    fetched_at: Optional[str] = None
    source: Optional[str] = None
    roe_source: Optional[str] = None


@dataclass(frozen=True)
class GateCheck:
    field: str
    value: Optional[float]
    threshold: Optional[float]
    op: str
    outcome: str  # pass | fail | missing


@dataclass(frozen=True)
class GateResult:
    passed: bool
    checks: tuple[GateCheck, ...]
    reason: Optional[str]
    excluded: bool = False


@dataclass(frozen=True)
class RegimeResult:
    regime: Regime
    longs_allowed: bool
    shorts_allowed: bool
    nifty_close: Optional[float] = None
    nifty_ema_fast: Optional[float] = None
    nifty_ema_slow: Optional[float] = None
    roc_18m: Optional[float] = None
    roc_bars_used: Optional[int] = None
    vix: Optional[float] = None
    smallcap_confirms: Optional[bool] = None
    smallcap_close: Optional[float] = None
    smallcap_ema_fast: Optional[float] = None
    smallcap_ema_slow: Optional[float] = None
    reasons: tuple[str, ...] = ()


@dataclass(frozen=True)
class MomentumLeg:
    found: bool
    move_pct: Optional[float] = None
    max_daily_pct: Optional[float] = None
    leg_high: Optional[float] = None
    leg_mean_volume: Optional[float] = None
    start_idx: Optional[int] = None
    end_idx: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    age_bars: Optional[int] = None
    qualifies_by_move: bool = False
    qualifies_by_daily: bool = False
    rejected_reason: Optional[str] = None


@dataclass(frozen=True)
class VcpResult:
    valid: bool
    depth_pct: Optional[float] = None
    depth_ok: bool = False
    vol_dry_pct: Optional[float] = None
    vol_dry_ok: bool = False
    above_ema10: bool = False
    above_ema20: bool = False
    above_ema50: bool = False
    stage2: bool = False
    ema10: Optional[float] = None
    ema20: Optional[float] = None
    ema50: Optional[float] = None
    ema200: Optional[float] = None
    recent_mean_volume: Optional[float] = None


@dataclass(frozen=True)
class BarPattern:
    kind: Optional[str]  # "IB" | "MB" | None
    trigger: Optional[float] = None
    pattern_low: Optional[float] = None
    bar_idx: Optional[int] = None
    bar_date: Optional[str] = None


@dataclass(frozen=True)
class ShortSignals:
    stage4: bool
    downtrend: bool
    double_top: bool
    weak_bounce: bool
    low_vol_bounce: bool
    red_confirm: bool
    weak_bounce_method: str
    bounce_ratio: Optional[float] = None
    double_top_peak1: Optional[float] = None
    double_top_peak2: Optional[float] = None
    ema50: Optional[float] = None
    ema200: Optional[float] = None
    recent_mean_volume: Optional[float] = None
    vol20: Optional[float] = None


@dataclass(frozen=True)
class ScoreComponent:
    rule_id: str
    label: str
    points: float
    max_points: float
    matched: bool
    value: Optional[float] = None
    unit: Optional[str] = None
    detail: Optional[str] = None


@dataclass(frozen=True)
class ScoreBreakdown:
    side: Side
    raw: float
    max_possible: float
    normalised: float
    display: float
    band: Band
    components: tuple[ScoreComponent, ...]


@dataclass(frozen=True)
class GradeResult:
    grade: Grade
    alignment: RegimeAlignment
    fundamentals_strong: Optional[bool]  # None for shorts (not evaluated)
    reasons: tuple[str, ...]


@dataclass(frozen=True)
class TradePlan:
    """Price levels only. No quantities, no capital."""

    side: Side
    entry: float
    entry_max: Optional[float]
    stop: float
    stop_rule: StopRule
    floor_applied: bool
    stop_candidates: dict[str, float]
    stop_distance_pct: float
    r_value: float  # risk per share at the worst-case entry (entry_max for longs)
    risk_reference_price: float
    target: float
    target_rule: TargetRule
    target_structure_level: Optional[float]
    reward_risk: float
    target_pct: float
    extended_target: float
    extended_target_r: float
    atr14: float
    prev_bar_low: Optional[float] = None
    breakeven_trigger: Optional[float] = None
    trail_weekly_ema: Optional[float] = None
    trail_weekly_sma: Optional[float] = None
    trail_weekly_ema_len: Optional[int] = None
    trail_weekly_sma_len: Optional[int] = None
    weekly_bars_available: Optional[int] = None
    multibagger_arm_price: Optional[float] = None
    notes: tuple[str, ...] = ()


@dataclass(frozen=True)
class MultibaggerTag:
    """Heuristic 'could run a long way' tag. Criteria follow the widely published trend-template
    approach (Stage 2 structure, distance from 52-week low/high, relative strength) plus growth.
    Not backtested yet; the engine only reports which criteria hold."""

    level: MultibaggerLevel
    technical_met: int
    technical_total: int
    growth_met: bool
    criteria: dict[str, Optional[bool]]


@dataclass(frozen=True)
class PriceContext:
    high_52w: Optional[float]
    low_52w: Optional[float]
    pct_from_52w_high: Optional[float]  # negative = below high
    pct_above_52w_low: Optional[float]
    atr_pct: Optional[float]
    roc_20: Optional[float]
    avg_volume_20: Optional[float]
    # Screener fields (v4). All optional so older fixtures/goldens keep loading.
    rsi14: Optional[float] = None
    vol_ratio_20: Optional[float] = None  # last bar volume / 20-day average volume
    dist_ema20_pct: Optional[float] = None  # (close / ema20 - 1) * 100
    dist_ema50_pct: Optional[float] = None
    pct_from_20d_high: Optional[float] = None  # close vs highest high of the prior 20 bars; >0 = breakout above it
    higher_highs_lows: Optional[bool] = None  # last 20 bars made a higher high AND higher low than the 20 before


@dataclass(frozen=True)
class Candidate:
    symbol: str
    side: Side
    sector: Optional[str]
    name: Optional[str]
    close: float
    last_bar_date: str
    score: ScoreBreakdown
    plan: Optional[TradePlan]
    grade: Optional[GradeResult] = None
    fno_eligible: bool = True
    cap_bucket: CapBucket = CapBucket.UNKNOWN
    market_cap_cr: Optional[float] = None
    multibagger: Optional[MultibaggerTag] = None
    context: Optional[PriceContext] = None
    gate: Optional[GateResult] = None
    leg: Optional[MomentumLeg] = None
    vcp: Optional[VcpResult] = None
    bar_pattern: Optional[BarPattern] = None
    colour_change: Optional[bool] = None
    rs_vs_nifty: Optional[float] = None
    short_signals: Optional[ShortSignals] = None
    fundamentals: Optional[Fundamentals] = None
    indicators: dict[str, Optional[float]] = field(default_factory=dict)
    rank: Optional[int] = None
    rank_status: Optional[RankStatus] = None
    rank_reason: Optional[str] = None
    warnings: tuple[str, ...] = ()
    reason_text: str = ""


@dataclass(frozen=True)
class UniverseRow:
    """One line of the universe screen: every usable F&O symbol with its swing context."""

    symbol: str
    name: Optional[str]
    sector: Optional[str]
    cap_bucket: CapBucket
    market_cap_cr: Optional[float]
    fno_eligible: bool
    close: Optional[float]
    last_bar_date: Optional[str]
    outcome: SymbolOutcome
    stage: Optional[str]  # "stage2" | "stage4" | "transition" | None
    above_ema50: Optional[bool]
    above_ema200: Optional[bool]
    rs_vs_nifty: Optional[float]
    context: Optional[PriceContext]
    multibagger: Optional[MultibaggerTag]
    swing_suitable: Optional[bool]
    swing_notes: tuple[str, ...]
    setup_side: Optional[Side]  # side of a candidate produced this run, if any


@dataclass(frozen=True)
class SymbolStatus:
    symbol: str
    stage_reached: str
    outcome: SymbolOutcome
    reasons: tuple[str, ...] = ()


@dataclass(frozen=True)
class SymbolInput:
    symbol: str
    daily: Optional[pd.DataFrame]
    fundamentals: Optional[Fundamentals]
    sector: Optional[str] = None
    name: Optional[str] = None
    fno_eligible: bool = True
    """Whether this symbol may be shorted (NSE F&O list membership). Cash-only equities can only
    generate long setups; the short detectors are skipped for them (defect-free: shorting outside
    F&O is not how retail short-selling works on NSE)."""


@dataclass(frozen=True)
class ScanInputs:
    session_date: date
    symbols: tuple[SymbolInput, ...]
    nifty_daily: Optional[pd.DataFrame]
    vix_close: Optional[float]
    smallcap_daily: Optional[pd.DataFrame]
    ban_list: Optional[frozenset[str]]
    universe_size: int


@dataclass(frozen=True)
class ScanResult:
    session_date: str
    regime: RegimeResult
    candidates: tuple[Candidate, ...]
    symbol_status: tuple[SymbolStatus, ...]
    universe: tuple[UniverseRow, ...]
    counts: dict[str, float]  # ints plus a few breadth medians
    warnings: tuple[str, ...]
    ban_list_available: bool
    scan_performed: bool
