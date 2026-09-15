"""Data structures for all engine inputs and outputs.

Everything here is a frozen dataclass or enum so results are immutable and
serialise deterministically through `engine.canonical`.
"""

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
    DEFERRED_RISK_BUDGET = "deferred_risk_budget"
    DEFERRED_GROSS_EXPOSURE = "deferred_gross_exposure"
    DEFERRED_SECTOR_CAP = "deferred_sector_cap"
    DEFERRED_MAX_POSITIONS = "deferred_max_positions"
    ALREADY_HELD = "already_held"


class Band(str, Enum):
    A = "A"
    B = "B"
    C = "C"


@dataclass(frozen=True)
class Fundamentals:
    """Provider-normalised fundamentals. All optional; None means MISSING.

    Units: market_cap_cr in INR crore; debt_equity as a RATIO; roe, revenue_growth,
    eps_growth in percent.
    """

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
    roe_source: Optional[str] = None  # e.g. "returnOnEquity" or "derived:netIncomeToCommon/(bookValue*sharesOutstanding)"


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
    excluded: bool = False  # treat_missing_fundamental_as == exclude and a field was missing


@dataclass(frozen=True)
class RegimeResult:
    regime: Regime
    longs_allowed: bool
    shorts_allowed: bool
    size_multiplier: Optional[float]
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
    start_idx: Optional[int] = None  # positions in the full frame
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
class TradePlan:
    side: Side
    entry: float
    entry_max: Optional[float]
    stop: float
    stop_rule: StopRule
    floor_applied: bool
    stop_candidates: dict[str, float]
    stop_distance_pct: float
    risk_per_share: float
    sizing_price: float
    atr14: float
    prev_bar_low: Optional[float]
    qty_raw: int
    qty_after_regime: int
    qty: int
    regime_multiplier: float
    caps_applied: tuple[str, ...]
    position_value: float
    risk_amount: float
    r_value: float
    breakeven_trigger: Optional[float] = None
    partial_1_price: Optional[float] = None
    partial_1_pct: Optional[float] = None
    partial_2_price: Optional[float] = None
    partial_2_pct: Optional[float] = None
    trail_weekly_ema: Optional[float] = None
    trail_weekly_sma: Optional[float] = None
    trail_weekly_ema_len: Optional[int] = None
    trail_weekly_sma_len: Optional[int] = None
    weekly_bars_available: Optional[int] = None
    multibagger_arm_price: Optional[float] = None
    target_1_price: Optional[float] = None
    target_1_pct: Optional[float] = None
    target_2_price: Optional[float] = None
    target_2_pct: Optional[float] = None
    notes: tuple[str, ...] = ()


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
class SymbolStatus:
    symbol: str
    stage_reached: str
    outcome: SymbolOutcome
    reasons: tuple[str, ...] = ()


@dataclass(frozen=True)
class OpenPosition:
    """An open journal position. Only the browser knows these; the pipeline passes []."""

    symbol: str
    side: Side
    sector: Optional[str]
    qty: int
    entry: float
    stop: float
    position_value: float
    risk_amount: float


@dataclass(frozen=True)
class PortfolioBudget:
    capital: float
    open_positions: int
    open_gross_value: float
    open_risk_amount: float
    accepted_positions: int
    accepted_gross_value: float
    accepted_risk_amount: float
    gross_cap: float
    risk_cap: float
    per_sector: dict[str, int]


@dataclass(frozen=True)
class SymbolInput:
    """All data the engine needs for one symbol. Frames are daily OHLCV with lowercase columns
    open, high, low, close, volume and a DatetimeIndex sorted ascending."""

    symbol: str
    daily: Optional[pd.DataFrame]
    fundamentals: Optional[Fundamentals]
    sector: Optional[str] = None
    name: Optional[str] = None


@dataclass(frozen=True)
class ScanInputs:
    session_date: date
    symbols: tuple[SymbolInput, ...]
    nifty_daily: Optional[pd.DataFrame]
    vix_close: Optional[float]
    smallcap_daily: Optional[pd.DataFrame]
    ban_list: Optional[frozenset[str]]  # None => unavailable
    universe_size: int


@dataclass(frozen=True)
class ScanResult:
    session_date: str
    regime: RegimeResult
    candidates: tuple[Candidate, ...]
    symbol_status: tuple[SymbolStatus, ...]
    counts: dict[str, int]
    warnings: tuple[str, ...]
    ban_list_available: bool
    scan_performed: bool
    budget: Optional[PortfolioBudget]
