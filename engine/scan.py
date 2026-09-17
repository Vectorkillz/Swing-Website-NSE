"""Scan orchestration: per-symbol pipeline and universe-level assembly. Pure."""

from __future__ import annotations

from datetime import date

import pandas as pd

from .config import ScanConfig
from .context import cap_bucket, multibagger_tag, price_context, stage_label, swing_suitability
from .detectors import colour_change, detect_bar_pattern, momentum_leg, rs_vs_index, short_signals, vcp
from .gates import long_gate, short_gate
from .grading import grade_candidate
from .indicators import add_indicators, last
from .portfolio import rank_candidates
from .quality import check_daily
from .regime import classify_regime
from .risk import plan_long, plan_short
from .scoring import LongFeatures, score_long, score_short
from .types import (
    Candidate,
    CapBucket,
    Regime,
    RegimeResult,
    ScanInputs,
    ScanResult,
    Side,
    SymbolInput,
    SymbolOutcome,
    SymbolStatus,
    UniverseRow,
)

INDICATOR_COLS = ("ema10", "ema20", "ema50", "ema200", "sma150", "atr14", "vol20")


def _long_reason(leg, v, bp, cc, f) -> str:
    parts = []
    if v.stage2:
        parts.append("Stage 2 uptrend (close > EMA200, EMA50 > EMA200)")
    elif v.above_ema50:
        parts.append("Above EMA50")
    if leg.move_pct is not None:
        parts.append(f"Prior leg +{leg.move_pct:.1f}% ({leg.start_date} to {leg.end_date})")
    if v.depth_pct is not None:
        parts.append(f"Pullback {v.depth_pct:.1f}% from leg high")
    if v.vol_dry_pct is not None:
        parts.append(f"Volume {v.vol_dry_pct:.0f}% of leg average")
    if bp.kind:
        parts.append(f"{bp.kind} trigger at {bp.trigger:.2f}")
    if cc:
        parts.append("Colour change (green after two reds, above EMA50)")
    if f is not None:
        if f.revenue_growth is not None:
            parts.append(f"Revenue {f.revenue_growth:+.1f}% YoY")
        if f.eps_growth is not None:
            parts.append(f"EPS {f.eps_growth:+.1f}% YoY")
        if f.roe is not None:
            parts.append(f"ROE {f.roe:.1f}%")
        if f.fcf_positive:
            parts.append("FCF positive")
    return " | ".join(parts) if parts else "Setup matched"


def _short_reason(s) -> str:
    parts = []
    if s.stage4:
        parts.append("Stage 4 (close < EMA50 and < EMA200)")
    if s.double_top:
        parts.append("Double top structure")
    if s.downtrend:
        parts.append("Lower highs and lower lows")
    if s.weak_bounce:
        parts.append(f"Weak bounce (ratio {s.bounce_ratio:.2f})" if s.bounce_ratio is not None else "Weak bounce")
    if s.low_vol_bounce:
        parts.append("Low volume on bounce")
    if s.red_confirm:
        parts.append("Red confirmation candle")
    return " | ".join(parts) if parts else "Setup matched"


def _universe_row(inp: SymbolInput, df: pd.DataFrame | None, outcome: SymbolOutcome, nifty_close, cfg: ScanConfig, side: Side | None) -> UniverseRow:
    f = inp.fundamentals
    mcap = f.market_cap_cr if f else None
    bucket = cap_bucket(mcap, cfg)
    sector = inp.sector or (f.sector if f else None)
    name = inp.name or (f.name if f else None)
    if df is None:
        return UniverseRow(inp.symbol, name, sector, bucket, mcap, inp.fno_eligible, None, None, outcome, None, None, None, None, None, None, None, ("data unavailable",), side)
    ctx = price_context(df)
    rs = rs_vs_index(df["close"], nifty_close, cfg.rs_lookback_bars)
    close = float(df["close"].iloc[-1])
    e50, e200 = last(df, "ema50"), last(df, "ema200")
    ok, notes = swing_suitability(ctx, f, cfg)
    return UniverseRow(
        symbol=inp.symbol, name=name, sector=sector, cap_bucket=bucket, market_cap_cr=mcap, fno_eligible=inp.fno_eligible, close=close,
        last_bar_date=pd.Timestamp(df.index[-1]).date().isoformat(), outcome=outcome, stage=stage_label(df),
        above_ema50=(close > e50) if e50 is not None else None, above_ema200=(close > e200) if e200 is not None else None,
        rs_vs_nifty=rs, context=ctx, multibagger=multibagger_tag(df, ctx, rs, f, bucket, cfg), swing_suitable=ok, swing_notes=notes, setup_side=side,
    )


def scan_symbol(
    inp: SymbolInput, regime: RegimeResult, nifty_close: pd.Series | None, ban_list: frozenset[str] | None, session_date: date, cfg: ScanConfig
) -> tuple[list[Candidate], SymbolStatus, UniverseRow]:
    sym = inp.symbol
    problems = check_daily(inp.daily, session_date, cfg)
    if problems:
        st = SymbolStatus(sym, "quality", SymbolOutcome.DATA_UNAVAILABLE, tuple(problems))
        return [], st, _universe_row(inp, None, st.outcome, nifty_close, cfg, None)
    assert inp.daily is not None
    df = add_indicators(inp.daily)
    close = float(df["close"].iloc[-1])
    last_date = pd.Timestamp(df.index[-1]).date().isoformat()
    atr = last(df, "atr14")
    ind = {c: last(df, c) for c in INDICATOR_COLS}
    f = inp.fundamentals
    sector = inp.sector or (f.sector if f else None)
    name = inp.name or (f.name if f else None)
    mcap = f.market_cap_cr if f else None
    bucket = cap_bucket(mcap, cfg)
    ctx = price_context(df)
    rs = rs_vs_index(df["close"], nifty_close, cfg.rs_lookback_bars)
    mb = multibagger_tag(df, ctx, rs, f, bucket, cfg)

    out: list[Candidate] = []
    reasons: list[str] = []
    stage = "gates"
    excluded = False
    banned_short = False

    if regime.longs_allowed:
        g = long_gate(f, cfg)
        if not g.passed:
            reasons.append(f"long:{g.reason}")
            excluded = excluded or g.excluded
        else:
            stage = "detectors"
            leg = momentum_leg(df, cfg)
            if not leg.found:
                reasons.append(f"long:no_leg:{leg.rejected_reason}")
            else:
                v = vcp(df, leg, cfg)
                if not v.valid:
                    why = []
                    if not v.depth_ok:
                        why.append(f"depth {v.depth_pct:.1f}%")
                    if not v.vol_dry_ok:
                        why.append(f"vol {v.vol_dry_pct:.0f}%" if v.vol_dry_pct is not None else "vol n/a")
                    if not v.above_ema20:
                        why.append("below EMA20")
                    reasons.append("long:no_vcp:" + ",".join(why))
                else:
                    bp = detect_bar_pattern(df, cfg)
                    cc = colour_change(df)
                    sc = score_long(LongFeatures(leg, v, bp, cc, rs, f), cfg)
                    stage = "scoring"
                    if sc.raw < cfg.min_score_long:
                        reasons.append(f"long:score {sc.raw:g} < {cfg.min_score_long:g}")
                    else:
                        stage = "plan"
                        plan = plan_long(close, float(df["low"].iloc[-2]), atr, regime, cfg, leg_high=leg.leg_high, daily_for_weekly=inp.daily) if atr is not None else None
                        warnings = [] if plan else ["no_plan:risk per share not positive or ATR unavailable"]
                        grade = grade_candidate(sc.raw, Side.LONG, regime.regime, f, cfg)
                        out.append(Candidate(
                            symbol=sym, side=Side.LONG, sector=sector, name=name, close=close, last_bar_date=last_date, score=sc, plan=plan,
                            grade=grade, fno_eligible=inp.fno_eligible, cap_bucket=bucket, market_cap_cr=mcap, multibagger=mb, context=ctx, gate=g,
                            leg=leg, vcp=v, bar_pattern=bp, colour_change=cc, rs_vs_nifty=rs, fundamentals=f, indicators=ind, warnings=tuple(warnings),
                            reason_text=_long_reason(leg, v, bp, cc, f),
                        ))

    if regime.shorts_allowed and inp.fno_eligible:
        g = short_gate(f, cfg)
        if not g.passed:
            reasons.append(f"short:{g.reason}")
        else:
            s = short_signals(df, cfg)
            if s is None:
                reasons.append("short:insufficient_bars")
            elif not (s.stage4 and (s.downtrend or s.double_top)):
                reasons.append("short:no_setup")
            else:
                sc = score_short(s, cfg)
                if sc.raw < cfg.min_score_short:
                    reasons.append(f"short:score {sc.raw:g} < {cfg.min_score_short:g}")
                elif ban_list is not None and sym in ban_list:
                    reasons.append("short:banned")
                    banned_short = True
                elif ban_list is None and cfg.require_ban_list:
                    reasons.append("short:ban_list_unavailable (require_ban_list=true)")
                else:
                    warnings = [] if ban_list is not None else ["ban_list_unavailable: F&O ban status could not be verified"]
                    recent_low = float(df["low"].iloc[-cfg.short_target_lookback_bars :].min())
                    plan = plan_short(close, atr, regime, cfg, recent_low=recent_low) if atr is not None else None
                    if plan is None:
                        warnings.append("no_plan:risk per share not positive or ATR unavailable")
                    grade = grade_candidate(sc.raw, Side.SHORT, regime.regime, None, cfg)
                    out.append(Candidate(
                        symbol=sym, side=Side.SHORT, sector=sector, name=name, close=close, last_bar_date=last_date, score=sc, plan=plan,
                        grade=grade, fno_eligible=inp.fno_eligible, cap_bucket=bucket, market_cap_cr=mcap, multibagger=mb, context=ctx, gate=g,
                        short_signals=s, rs_vs_nifty=rs, fundamentals=f, indicators=ind, warnings=tuple(warnings), reason_text=_short_reason(s),
                    ))

    if out:
        st = SymbolStatus(sym, "plan", SymbolOutcome.CANDIDATE, tuple(reasons))
    elif banned_short:
        st = SymbolStatus(sym, "ban_check", SymbolOutcome.BANNED, tuple(reasons))
    elif excluded:
        st = SymbolStatus(sym, "gates", SymbolOutcome.FUNDAMENTALS_MISSING, tuple(reasons))
    elif stage == "gates":
        st = SymbolStatus(sym, stage, SymbolOutcome.REJECTED_GATE, tuple(reasons))
    elif stage == "scoring":
        st = SymbolStatus(sym, stage, SymbolOutcome.BELOW_MIN_SCORE, tuple(reasons))
    else:
        st = SymbolStatus(sym, stage, SymbolOutcome.NO_SETUP, tuple(reasons))
    side = out[0].side if out else None
    return out, st, _universe_row(inp, df, st.outcome, nifty_close, cfg, side)


def _median(xs: list[float]) -> float | None:
    if not xs:
        return None
    xs = sorted(xs)
    n = len(xs)
    return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2.0


def _breadth_counts(rows: list[UniverseRow]) -> dict[str, float]:
    """Market-breadth aggregates over the usable universe (rows with price context).

    Stored in run.json so the site can show breadth and a mood gauge for any past run
    without downloading that run's full universe file. Pure counts/medians; no modelling."""
    live = [r for r in rows if r.context is not None and r.close is not None]
    ctx = [r.context for r in live]
    rs = [r.rs_vs_nifty for r in live if r.rs_vs_nifty is not None]
    out: dict[str, float] = {
        "breadth_n": len(live),
        "breadth_above_ema50": sum(1 for r in live if r.above_ema50),
        "breadth_above_ema200": sum(1 for r in live if r.above_ema200),
        "breadth_stage2": sum(1 for r in live if r.stage == "stage2"),
        "breadth_stage4": sum(1 for r in live if r.stage == "stage4"),
        "breadth_rs_positive": sum(1 for x in rs if x > 0),
        "breadth_near_52w_high": sum(1 for c in ctx if c.pct_from_52w_high is not None and c.pct_from_52w_high >= -5.0),
        "breadth_near_52w_low": sum(1 for c in ctx if c.pct_above_52w_low is not None and c.pct_above_52w_low <= 5.0),
        "breadth_roc20_positive": sum(1 for c in ctx if c.roc_20 is not None and c.roc_20 > 0),
        "breadth_vol_surge": sum(1 for c in ctx if c.vol_ratio_20 is not None and c.vol_ratio_20 >= 2.0),
        "breadth_hh_hl": sum(1 for c in ctx if c.higher_highs_lows),
    }
    for key, vals in (
        ("breadth_median_rsi14", [c.rsi14 for c in ctx if c.rsi14 is not None]),
        ("breadth_median_roc20", [c.roc_20 for c in ctx if c.roc_20 is not None]),
        ("breadth_median_from_52w_high", [c.pct_from_52w_high for c in ctx if c.pct_from_52w_high is not None]),
    ):
        m = _median(vals)
        if m is not None:
            out[key] = round(m, 4)
    return out


def scan_universe(inputs: ScanInputs, cfg: ScanConfig) -> ScanResult:
    regime = classify_regime(inputs.nifty_daily, inputs.vix_close, inputs.smallcap_daily, cfg)
    warnings: list[str] = []
    session = inputs.session_date.isoformat()
    ban_available = inputs.ban_list is not None
    if not ban_available:
        warnings.append("ban_list_unavailable")

    if regime.regime is Regime.UNKNOWN:
        statuses = tuple(SymbolStatus(s.symbol, "regime", SymbolOutcome.NO_SETUP, ("not_scanned:regime_unknown",)) for s in sorted(inputs.symbols, key=lambda s: s.symbol))
        warnings.append("regime_unknown:no_scan")
        return ScanResult(session, regime, (), statuses, (), {"universe": inputs.universe_size, "scanned": 0}, tuple(warnings), ban_available, False)

    nifty_close = inputs.nifty_daily["close"] if inputs.nifty_daily is not None else None
    cands: list[Candidate] = []
    statuses: list[SymbolStatus] = []
    rows: list[UniverseRow] = []
    for inp in sorted(inputs.symbols, key=lambda s: s.symbol):
        c, st, row = scan_symbol(inp, regime, nifty_close, inputs.ban_list, inputs.session_date, cfg)
        cands.extend(c)
        statuses.append(st)
        rows.append(row)

    final = rank_candidates(cands, cfg)
    usable = sum(1 for s in statuses if s.outcome is not SymbolOutcome.DATA_UNAVAILABLE)
    coverage = (usable / inputs.universe_size * 100.0) if inputs.universe_size else 0.0
    if coverage < cfg.min_universe_coverage_pct:
        warnings.append(f"degraded:coverage {coverage:.1f}% < {cfg.min_universe_coverage_pct:g}%")

    counts = {
        "universe": inputs.universe_size,
        "scanned": len(statuses),
        "usable": usable,
        "data_unavailable": sum(1 for s in statuses if s.outcome is SymbolOutcome.DATA_UNAVAILABLE),
        "fundamentals_missing": sum(1 for s in statuses if s.outcome is SymbolOutcome.FUNDAMENTALS_MISSING),
        "rejected_gate": sum(1 for s in statuses if s.outcome is SymbolOutcome.REJECTED_GATE),
        "no_setup": sum(1 for s in statuses if s.outcome is SymbolOutcome.NO_SETUP),
        "below_min_score": sum(1 for s in statuses if s.outcome is SymbolOutcome.BELOW_MIN_SCORE),
        "banned": sum(1 for s in statuses if s.outcome is SymbolOutcome.BANNED),
        "candidates_long": sum(1 for c in final if c.side is Side.LONG),
        "candidates_short": sum(1 for c in final if c.side is Side.SHORT),
        "ranked_long": sum(1 for c in final if c.side is Side.LONG and c.rank_status is not None and c.rank_status.value == "ranked"),
        "ranked_short": sum(1 for c in final if c.side is Side.SHORT and c.rank_status is not None and c.rank_status.value == "ranked"),
        "swing_suitable": sum(1 for r in rows if r.swing_suitable),
        "multibagger_strong": sum(1 for r in rows if r.multibagger and r.multibagger.level.value == "strong"),
        "multibagger_watch": sum(1 for r in rows if r.multibagger and r.multibagger.level.value == "watch"),
        "grade_app": sum(1 for c in final if c.grade and c.grade.grade.value == "A++"),
        "grade_ap": sum(1 for c in final if c.grade and c.grade.grade.value == "A+"),
        "grade_a": sum(1 for c in final if c.grade and c.grade.grade.value == "A"),
        "grade_bp": sum(1 for c in final if c.grade and c.grade.grade.value == "B+"),
        "grade_b": sum(1 for c in final if c.grade and c.grade.grade.value == "B"),
    }
    counts.update(_breadth_counts(rows))
    return ScanResult(session, regime, tuple(final), tuple(statuses), tuple(rows), counts, tuple(warnings), ban_available, True)
