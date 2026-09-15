"""Versioned scan configuration.

Every threshold used anywhere in the engine lives here. Profiles are immutable
JSON files (config/profiles/vNNN.json); a new version is a new file. The JSON
schema exported from this model (with `x-unit`, `x-group`) drives the web
settings page, so every field must carry a unit and a description.

v2 schema (2026-09-15): position sizing and portfolio caps were removed at the
owner's request. Plans are price levels only: entry zone, stop, target(s).
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

    # ---- entry / stop / target ------------------------------------------------
    long_entry_offset_pct: float = F(0.2, unit="pct", group="plan", description="Long entry = close x (1 + N%).", ge=0)
    long_entry_max_offset_pct: float = F(0.8, unit="pct", group="plan", description="Do-not-chase limit: entry_max = close x (1 + N%).", ge=0)
    short_entry_offset_pct: float = F(0.2, unit="pct", group="plan", description="Short entry = close x (1 - N%).", ge=0)
    sl_pct: float = F(2.5, unit="pct", group="plan", description="Percentage stop candidate below/above entry.", gt=0, le=20)
    sl_atr_mult: float = F(1.5, unit="x ATR14", group="plan", description="ATR multiple stop candidate.", gt=0, le=10)
    prev_low_stop_buffer_pct: float = F(0.5, unit="pct", group="plan", description="Previous-bar-low stop candidate = prev_low x (1 - N%).", ge=0)
    min_stop_distance_pct: float = F(1.0, unit="pct", group="plan", description="Floor on stop distance from entry (defect 7.1 guard).", gt=0, le=10)
    target_min_rr: float = F(1.0, unit="R", group="plan", description="Target is never closer than this many R from entry.", ge=0.5)
    target_fallback_r: float = F(2.0, unit="R", group="plan", description="Target when no structural level lies beyond entry.", gt=0)
    short_target_lookback_bars: int = F(20, unit="bars", group="plan", description="Short structural target = lowest low over this many bars.", ge=5)
    extended_target_r: float = F(3.0, unit="R", group="plan", description="Second, extended target shown for reference.", gt=0)
    breakeven_at_r: float = F(2.0, unit="R", group="plan", description="Suggested breakeven trigger: entry + N x R.", gt=0)
    trail_ema_weeks: int = F(20, unit="weeks", group="plan", description="Weekly EMA length for the Stage 2 trail (real weekly bars).", ge=2)
    trail_sma_weeks: int = F(30, unit="weeks", group="plan", description="Weekly SMA length for the multibagger trail (real weekly bars).", ge=2)
    multibagger_arm_pct: float = F(40.0, unit="pct", group="plan", description="Gain after which the 30-week SMA trail replaces the weekly EMA20 trail.", gt=0)

    # ---- regime -------------------------------------------------------------
    regime_ema_fast: int = F(10, unit="bars", group="regime", description="Fast EMA on Nifty for regime.", ge=2)
    regime_ema_slow: int = F(20, unit="bars", group="regime", description="Slow EMA on Nifty for regime.", ge=2)
    regime_roc_bars: int = F(378, unit="bars", group="regime", description="Lookback for the 18-month ROC on Nifty (uses min(N, len-1)).", ge=20)
    roc_bull_min: float = F(0.0, unit="pct", group="regime", description="BULL requires ROC(18m) above this.")
    roc_bull_max: float = F(45.0, unit="pct", group="regime", description="BULL requires ROC(18m) below this.")
    vix_long_suppress: float = F(25.0, unit="index points", group="regime", description="BULL with India VIX above this becomes BULL_HIGH_VIX.", gt=0)
    allow_shorts_in_bull_high_vix: bool = F(False, unit="flag", group="regime", description="Reference behaviour disables shorts in BULL_HIGH_VIX (defect 7.2).")
    require_smallcap_confirmation_for_bull: bool = F(False, unit="flag", group="regime", description="Require Nifty Smallcap 100 close > EMA10 and > EMA20 for BULL.")

    # ---- eligibility gates ------------------------------------------------
    min_market_cap_cr: float = F(500.0, unit="INR crore", group="gates", description="Minimum market capitalisation.", ge=0)
    min_avg_volume: float = F(300000, unit="shares/day", group="gates", description="Minimum average daily volume for longs. Shorts use the factor below.", ge=0)
    short_avg_volume_factor: float = F(0.5, unit="x", group="gates", description="Short gate volume = factor x min_avg_volume.", gt=0)
    max_debt_equity: float = F(2.5, unit="ratio (debt / equity)", group="gates", description="Maximum debt to equity RATIO (yfinance percent is divided by 100 at the provider).", ge=0)
    min_roe: float = F(10.0, unit="pct", group="gates", description="Minimum return on equity.")
    min_revenue_growth: float = F(8.0, unit="pct YoY", group="gates", description="Minimum revenue growth.")
    min_eps_growth: float = F(10.0, unit="pct YoY", group="gates", description="EPS growth threshold used in scoring (not gated).")
    treat_missing_fundamental_as: Literal["reject", "pass", "exclude"] = F("reject", unit="enum", group="gates", description="Uniform handling of a missing fundamental field.")
    promoter_min_pct: Optional[float] = F(None, unit="pct", group="gates", description="Reserved. Not gated (no data source).")
    pledge_max_pct: Optional[float] = F(None, unit="pct", group="gates", description="Reserved. Not gated (no data source).")

    # ---- market-cap buckets ---------------------------------------------------
    largecap_min_cr: float = F(100000.0, unit="INR crore", group="buckets", description="Market cap at or above this is Large cap (AMFI-style cutoff; edit as AMFI updates).", gt=0)
    midcap_min_cr: float = F(33000.0, unit="INR crore", group="buckets", description="Market cap at or above this (and below Large) is Mid cap.", gt=0)
    smallcap_min_cr: float = F(5000.0, unit="INR crore", group="buckets", description="Market cap at or above this (and below Mid) is Small cap; below is Micro cap.", gt=0)

    # ---- multibagger potential tag (heuristic) --------------------------------
    mb_min_above_52w_low_pct: float = F(30.0, unit="pct", group="multibagger", description="Close must be at least N% above the 52-week low (trend template).", ge=0)
    mb_max_below_52w_high_pct: float = F(25.0, unit="pct", group="multibagger", description="Close must be within N% of the 52-week high (trend template).", ge=0)
    mb_min_revenue_growth: float = F(20.0, unit="pct YoY", group="multibagger", description="Growth criterion: revenue growth at least this.")
    mb_min_eps_growth: float = F(25.0, unit="pct YoY", group="multibagger", description="Growth criterion: EPS growth at least this.")
    mb_require_rs_positive: bool = F(True, unit="flag", group="multibagger", description="Require relative strength vs Nifty > 0.")
    mb_exclude_large_cap: bool = F(True, unit="flag", group="multibagger", description="Large caps are not tagged (multiples are rarer).")

    # ---- swing suitability (universe screen) -----------------------------------
    swing_min_atr_pct: float = F(1.5, unit="pct of close", group="universe", description="Minimum ATR14 as % of close for a stock to be considered swing-tradable.", ge=0)
    swing_max_atr_pct: float = F(8.0, unit="pct of close", group="universe", description="Maximum ATR14 as % of close (too erratic above this).", gt=0)

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
    min_daily_candle_pct: float = F(6.5, unit="pct", group="long", description="Leg also qualifies if the largest single-day move is at least this.")
    max_leg_age_bars: Optional[int] = F(None, unit="bars", group="long", description="Leg must end within N bars of the last bar (defect 7.5). null = disabled.", ge=0)
    vcp_depth_min: float = F(8.0, unit="pct", group="long", description="Minimum pullback depth from leg high.", ge=0)
    vcp_depth_max: float = F(25.0, unit="pct", group="long", description="Maximum pullback depth from leg high.", gt=0)
    volume_dry_pct: float = F(50.0, unit="pct of leg mean volume", group="long", description="Recent mean volume must be below this share of leg mean volume.", gt=0)
    vcp_recent_volume_bars: int = F(10, unit="bars", group="long", description="Bars used for the recent-volume mean.", ge=2)
    ema_support_tolerance_pct: float = F(1.0, unit="pct", group="long", description="Close must be at least EMA20 x (1 - N%).", ge=0)
    bar_pattern_lookback: int = F(5, unit="bars", group="long", description="Bars scanned for inside bar / mother bar.", ge=3)
    rs_lookback_bars: int = F(20, unit="bars", group="long", description="Lookback for relative strength vs Nifty.", ge=2)

    # ---- short detectors ----------------------------------------------------
    weak_bounce_method: Literal["single_bar_high", "swing_high"] = F("single_bar_high", unit="enum", group="short", description="single_bar_high = reference formula (defect 7.6 preserved). swing_high = pivot-based correction.")
    weak_bounce_max_ratio: float = F(0.30, unit="ratio", group="short", description="Bounce counts as weak below this retrace ratio.", gt=0, le=1)
    double_top_tolerance_pct: float = F(3.0, unit="pct", group="short", description="Two peaks within this percentage form a double top.", gt=0)
    low_volume_bounce_factor: float = F(0.8, unit="x 20-day avg volume", group="short", description="Mean volume of last 5 bars below factor x vol20 counts as low-volume bounce.", gt=0)

    # ---- scoring -------------------------------------------------------------
    min_score_long: float = F(60.0, unit="points (raw)", group="scoring", description="Minimum raw long score.", ge=0)
    min_score_short: float = F(60.0, unit="points (raw)", group="scoring", description="Minimum raw short score.", ge=0)
    rs_score_weight: float = F(0.0, unit="points", group="scoring", description="Points when rs_vs_nifty > 0. Default 0 so enabling is explicit.", ge=0)
    clip_score_display_at_100: bool = F(True, unit="flag", group="scoring", description="Clip the displayed score at 100 (defect 7.10). Raw and normalised are stored unclipped.")
    band_a_min: float = F(85.0, unit="points (raw)", group="scoring", description="Raw score at or above this is band A.")
    band_b_min: float = F(70.0, unit="points (raw)", group="scoring", description="Raw score at or above this (below A) is band B.")

    # ---- ranking -------------------------------------------------------------
    top_n_longs: int = F(10, unit="count", group="ranking", description="Long setups kept after sorting by raw score.", ge=0)
    top_n_shorts: int = F(10, unit="count", group="ranking", description="Short setups kept after sorting by raw score.", ge=0)

    # ---- output ---------------------------------------------------------------
    chart_bars: int = F(300, unit="bars", group="output", description="Daily bars exported per chart file.", ge=50)
    keep_runs: int = F(60, unit="runs", group="output", description="Run directories kept in the repo.", ge=1)
    lookback_daily_days: int = F(1095, unit="calendar days", group="output", description="Daily history retained per symbol.", ge=400)

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
        if not (self.smallcap_min_cr < self.midcap_min_cr < self.largecap_min_cr):
            raise ValueError("cap buckets must satisfy smallcap_min_cr < midcap_min_cr < largecap_min_cr")
        if self.swing_min_atr_pct >= self.swing_max_atr_pct:
            raise ValueError("swing_min_atr_pct must be < swing_max_atr_pct")
        if self.target_fallback_r < self.target_min_rr:
            raise ValueError("target_fallback_r must be >= target_min_rr")
        return self


def config_hash(cfg: ScanConfig) -> str:
    payload = json.dumps(cfg.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def load_profile_text(text: str) -> ScanConfig:
    return ScanConfig.model_validate(json.loads(text))


def load_profile(path: Path) -> tuple[str, ScanConfig]:
    return path.stem, load_profile_text(path.read_text(encoding="utf-8"))


def export_json_schema() -> dict[str, Any]:
    schema = ScanConfig.model_json_schema()
    schema["title"] = "ScanConfig"
    return schema


def diff_profiles(a: ScanConfig, b: ScanConfig) -> list[dict[str, Any]]:
    da, db = a.model_dump(mode="json"), b.model_dump(mode="json")
    return [{"field": k, "from": da[k], "to": db[k]} for k in sorted(da) if da[k] != db[k]]
