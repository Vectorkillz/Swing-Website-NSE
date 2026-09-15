"""Versioned scan configuration.

Every threshold used anywhere in the engine lives here. Profiles are immutable
JSON files (config/profiles/vNNN.json); a new version is a new file. The JSON
schema exported from this model (with `x-unit`, `x-group`) drives the web
Config page, so every field must carry a unit and a description.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


def F(default: Any, *, unit: str, group: str, description: str, **kw: Any) -> Any:  # noqa: N802
    return Field(default, description=description, json_schema_extra={"x-unit": unit, "x-group": group}, **kw)


class ScanConfig(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    # ---- capital & risk -------------------------------------------------
    capital: float = F(500000, unit="INR", group="risk", description="Trading capital used for sizing.", gt=0)
    risk_per_trade_pct: float = F(2.0, unit="pct", group="risk", description="Capital risked per trade (entry to stop).", gt=0, le=10)
    sl_pct: float = F(2.5, unit="pct", group="risk", description="Percentage stop candidate below/above entry.", gt=0, le=20)
    sl_atr_mult: float = F(1.5, unit="x ATR14", group="risk", description="ATR multiple stop candidate.", gt=0, le=10)
    min_stop_distance_pct: float = F(1.0, unit="pct", group="risk", description="Floor on stop distance from entry. Prevents size blow-up on tiny ranges (defect 7.1).", gt=0, le=10)
    max_position_pct_of_capital: float = F(20.0, unit="pct", group="risk", description="Cap on a single position's value as % of capital.", gt=0, le=100)
    max_gross_exposure_pct: float = F(100.0, unit="pct", group="risk", description="Cap on sum of open + accepted position values as % of capital.", gt=0, le=300)
    max_portfolio_risk_pct: float = F(10.0, unit="pct", group="risk", description="Cap on sum of open + accepted risk amounts as % of capital. Enforced, candidates beyond it are deferred.", gt=0, le=100)
    max_concurrent_positions: int = F(6, unit="count", group="risk", description="Maximum open + accepted positions.", ge=1, le=100)
    max_positions_per_sector: int = F(2, unit="count", group="risk", description="Maximum open + accepted positions per sector.", ge=1, le=100)
    allow_pyramiding: bool = F(False, unit="flag", group="risk", description="Allow a new long in a symbol already held open in the journal.")
    partial_exit_1_r: float = F(2.0, unit="R", group="exits", description="First partial exit at entry + N x R.", gt=0)
    partial_exit_1_pct: float = F(25.0, unit="pct of qty", group="exits", description="Quantity sold at partial exit 1.", ge=0, le=100)
    partial_exit_2_gain_pct: float = F(20.0, unit="pct", group="exits", description="Second partial exit at entry x (1 + N%).", gt=0)
    partial_exit_2_pct: float = F(25.0, unit="pct of qty", group="exits", description="Quantity sold at partial exit 2.", ge=0, le=100)
    breakeven_at_r: float = F(2.0, unit="R", group="exits", description="Move stop to breakeven once price reaches entry + N x R.", gt=0)
    multibagger_arm_pct: float = F(40.0, unit="pct", group="exits", description="Gain after which the 30-week SMA trail replaces the weekly EMA20 trail.", gt=0)
    trail_ema_weeks: int = F(20, unit="weeks", group="exits", description="Weekly EMA length for the Stage 2 trail. Computed from real weekly bars.", ge=2)
    trail_sma_weeks: int = F(30, unit="weeks", group="exits", description="Weekly SMA length for the multibagger trail. Computed from real weekly bars.", ge=2)
    short_target_1_r: float = F(2.0, unit="R", group="exits", description="Short target 1 in R.", gt=0)
    short_target_2_r: float = F(3.0, unit="R", group="exits", description="Short target 2 in R.", gt=0)
    short_target_1_pct: float = F(50.0, unit="pct of qty", group="exits", description="Quantity covered at short target 1.", ge=0, le=100)
    short_target_2_pct: float = F(50.0, unit="pct of qty", group="exits", description="Quantity covered at short target 2.", ge=0, le=100)
    long_entry_offset_pct: float = F(0.2, unit="pct", group="entry", description="Long entry = close x (1 + N%).", ge=0)
    long_entry_max_offset_pct: float = F(0.8, unit="pct", group="entry", description="Do-not-chase limit: entry_max = close x (1 + N%). Sizing uses this worst case.", ge=0)
    short_entry_offset_pct: float = F(0.2, unit="pct", group="entry", description="Short entry = close x (1 - N%).", ge=0)
    prev_low_stop_buffer_pct: float = F(0.5, unit="pct", group="risk", description="Previous-bar-low stop candidate = prev_low x (1 - N%).", ge=0)

    # ---- regime -------------------------------------------------------------
    regime_ema_fast: int = F(10, unit="bars", group="regime", description="Fast EMA on Nifty for regime.", ge=2)
    regime_ema_slow: int = F(20, unit="bars", group="regime", description="Slow EMA on Nifty for regime.", ge=2)
    regime_roc_bars: int = F(378, unit="bars", group="regime", description="Lookback for the 18-month ROC on Nifty (uses min(N, len-1)).", ge=20)
    roc_bull_min: float = F(0.0, unit="pct", group="regime", description="BULL requires ROC(18m) above this.")
    roc_bull_max: float = F(45.0, unit="pct", group="regime", description="BULL requires ROC(18m) below this (overextension guard).")
    vix_long_suppress: float = F(25.0, unit="index points", group="regime", description="BULL with India VIX above this becomes BULL_HIGH_VIX (size x0.5).", gt=0)
    allow_shorts_in_bull_high_vix: bool = F(False, unit="flag", group="regime", description="Reference behaviour disables shorts in BULL_HIGH_VIX (defect 7.2). Set true to allow them.")
    require_smallcap_confirmation_for_bull: bool = F(False, unit="flag", group="regime", description="Require Nifty Smallcap 100 close > EMA10 and > EMA20 for BULL. Always displayed.")
    size_mult_bull: float = F(1.0, unit="x", group="regime", description="Size multiplier in BULL.", ge=0, le=1)
    size_mult_bull_high_vix: float = F(0.5, unit="x", group="regime", description="Size multiplier in BULL_HIGH_VIX.", ge=0, le=1)
    size_mult_neutral: float = F(0.75, unit="x", group="regime", description="Size multiplier in NEUTRAL.", ge=0, le=1)
    size_mult_bear: float = F(1.0, unit="x", group="regime", description="Size multiplier in BEAR.", ge=0, le=1)

    # ---- eligibility gates ------------------------------------------------
    min_market_cap_cr: float = F(500.0, unit="INR crore", group="gates", description="Minimum market capitalisation.", ge=0)
    min_avg_volume: float = F(300000, unit="shares/day", group="gates", description="Minimum average daily volume for longs. Shorts use 0.5x.", ge=0)
    short_avg_volume_factor: float = F(0.5, unit="x", group="gates", description="Short gate volume = factor x min_avg_volume.", gt=0)
    max_debt_equity: float = F(2.5, unit="ratio (debt / equity)", group="gates", description="Maximum debt to equity RATIO. yfinance reports percentage points; the provider divides by 100.", ge=0)
    min_roe: float = F(10.0, unit="pct", group="gates", description="Minimum return on equity.")
    min_revenue_growth: float = F(8.0, unit="pct YoY", group="gates", description="Minimum revenue growth.")
    min_eps_growth: float = F(10.0, unit="pct YoY", group="gates", description="EPS growth threshold used in scoring (not gated, as in reference).")
    treat_missing_fundamental_as: Literal["reject", "pass", "exclude"] = F("reject", unit="enum", group="gates", description="Uniform handling of a missing fundamental field: reject the symbol, pass the gate, or exclude from run with status fundamentals_missing.")
    promoter_min_pct: Optional[float] = F(None, unit="pct", group="gates", description="Reserved. Not gated in v1 (no data source).")
    pledge_max_pct: Optional[float] = F(None, unit="pct", group="gates", description="Reserved. Not gated in v1 (no data source).")

    # ---- data quality ---------------------------------------------------
    min_daily_bars: int = F(100, unit="bars", group="data", description="Minimum daily bars required per symbol.", ge=60)
    max_gap_sessions: int = F(5, unit="sessions", group="data", description="Reject a symbol whose bars skip more than N expected sessions.", ge=1)
    min_universe_coverage_pct: float = F(90.0, unit="pct", group="data", description="Run marked degraded when fewer symbols than this have usable data.", ge=0, le=100)
    require_ban_list: bool = F(True, unit="flag", group="data", description="No short plans when the F&O ban list is unavailable.")
    universe_stale_days: int = F(7, unit="days", group="data", description="Warn when the universe snapshot is older than this.", ge=1)

    # ---- long detectors -------------------------------------------------
    leg_lookback_bars: int = F(42, unit="bars", group="long", description="Bars searched for the momentum leg.", ge=23)
    leg_window_bars: int = F(22, unit="bars", group="long", description="Momentum leg window length.", ge=5)
    min_momentum_pct: float = F(20.0, unit="pct", group="long", description="Leg qualifies if window move is at least this.")
    min_daily_candle_pct: float = F(6.5, unit="pct", group="long", description="Leg also qualifies if largest single-day move in the window is at least this.")
    max_leg_age_bars: Optional[int] = F(None, unit="bars", group="long", description="Leg window must end within N bars of the last bar (defect 7.5). null = disabled (reference behaviour).", ge=0)
    vcp_depth_min: float = F(8.0, unit="pct", group="long", description="Minimum pullback depth from leg high.", ge=0)
    vcp_depth_max: float = F(25.0, unit="pct", group="long", description="Maximum pullback depth from leg high.", gt=0)
    volume_dry_pct: float = F(50.0, unit="pct of leg mean volume", group="long", description="Mean volume of last 10 bars must be below this share of leg mean volume.", gt=0)
    vcp_recent_volume_bars: int = F(10, unit="bars", group="long", description="Bars used for the recent-volume mean in the dry-up test.", ge=2)
    ema_support_tolerance_pct: float = F(1.0, unit="pct", group="long", description="Close must be at least EMA20 x (1 - N%) for VCP support.", ge=0)
    bar_pattern_lookback: int = F(5, unit="bars", group="long", description="Bars scanned for inside bar / mother bar.", ge=3)
    rs_lookback_bars: int = F(20, unit="bars", group="long", description="Lookback for relative strength vs Nifty (symbol ROC minus Nifty ROC).", ge=2)

    # ---- short detectors ----------------------------------------------------
    weak_bounce_method: Literal["single_bar_high", "swing_high"] = F("single_bar_high", unit="enum", group="short", description="single_bar_high = reference formula using high[-40] as denominator. swing_high = highest high between pivot swing start and swing low (defect 7.6 correction).")
    weak_bounce_max_ratio: float = F(0.30, unit="ratio", group="short", description="Bounce counts as weak when retrace ratio is below this.", gt=0, le=1)
    double_top_tolerance_pct: float = F(3.0, unit="pct", group="short", description="Two peaks within this percentage form a double top.", gt=0)
    low_volume_bounce_factor: float = F(0.8, unit="x 20-day avg volume", group="short", description="Mean volume of last 5 bars below factor x vol20 counts as low-volume bounce.", gt=0)

    # ---- scoring -------------------------------------------------------------
    min_score_long: float = F(60.0, unit="points (raw)", group="scoring", description="Minimum raw long score.", ge=0)
    min_score_short: float = F(60.0, unit="points (raw)", group="scoring", description="Minimum raw short score.", ge=0)
    rs_score_weight: float = F(0.0, unit="points", group="scoring", description="Points awarded when rs_vs_nifty > 0. Default 0 so enabling is explicit.", ge=0)
    clip_score_display_at_100: bool = F(True, unit="flag", group="scoring", description="Reference clipped the score at 100 (defect 7.10). Only the display value is clipped; raw and normalised are stored unclipped.")
    band_a_min: float = F(85.0, unit="points (raw)", group="scoring", description="Raw score at or above this is band A.")
    band_b_min: float = F(70.0, unit="points (raw)", group="scoring", description="Raw score at or above this (and below A) is band B. Below is C.")
    min_samples_for_calibration: int = F(100, unit="closed trades", group="scoring", description="Journal outcomes required before empirical hit rates are shown.", ge=1)

    # ---- ranking -------------------------------------------------------------
    top_n_longs: int = F(5, unit="count", group="ranking", description="Long candidates kept after sorting by raw score.", ge=0)
    top_n_shorts: int = F(5, unit="count", group="ranking", description="Short candidates kept after sorting by raw score.", ge=0)

    # ---- output ---------------------------------------------------------------
    chart_bars: int = F(300, unit="bars", group="output", description="Daily bars exported per chart file.", ge=50)
    keep_runs: int = F(60, unit="runs", group="output", description="Run directories kept in the repo (older pruned; git history retains them).", ge=1)
    lookback_daily_days: int = F(1095, unit="calendar days", group="output", description="Daily history retained per symbol (3 years; weekly trails need it).", ge=400)

    @model_validator(mode="after")
    def _check_ranges(self) -> "ScanConfig":
        if self.vcp_depth_min >= self.vcp_depth_max:
            raise ValueError("vcp_depth_min must be < vcp_depth_max")
        if self.roc_bull_min >= self.roc_bull_max:
            raise ValueError("roc_bull_min must be < roc_bull_max")
        if self.band_b_min >= self.band_a_min:
            raise ValueError("band_b_min must be < band_a_min")
        if self.regime_ema_fast >= self.regime_ema_slow:
            raise ValueError("regime_ema_fast must be < regime_ema_slow")
        if self.leg_window_bars >= self.leg_lookback_bars:
            raise ValueError("leg_window_bars must be < leg_lookback_bars")
        if self.long_entry_offset_pct > self.long_entry_max_offset_pct:
            raise ValueError("long_entry_offset_pct must be <= long_entry_max_offset_pct")
        if self.partial_exit_1_pct + self.partial_exit_2_pct > 100:
            raise ValueError("partial exits exceed 100% of quantity")
        if self.short_target_1_pct + self.short_target_2_pct > 100:
            raise ValueError("short targets exceed 100% of quantity")
        return self


def config_hash(cfg: ScanConfig) -> str:
    payload = json.dumps(cfg.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def load_profile_text(text: str) -> ScanConfig:
    return ScanConfig.model_validate(json.loads(text))


def load_profile(path: Path) -> tuple[str, ScanConfig]:
    """Returns (version_id, config). Version id is the file stem, e.g. 'v001'."""
    return path.stem, load_profile_text(path.read_text(encoding="utf-8"))


def export_json_schema() -> dict[str, Any]:
    schema = ScanConfig.model_json_schema()
    schema["title"] = "ScanConfig"
    return schema


def diff_profiles(a: ScanConfig, b: ScanConfig) -> list[dict[str, Any]]:
    da, db = a.model_dump(mode="json"), b.model_dump(mode="json")
    return [{"field": k, "from": da[k], "to": db[k]} for k in sorted(da) if da[k] != db[k]]
