"""Scan orchestration: per-symbol pipeline and universe-level assembly. Pure."""

from __future__ import annotations

from datetime import date

import pandas as pd

from .config import ScanConfig
from .detectors import colour_change, detect_bar_pattern, momentum_leg, rs_vs_index, short_signals, vcp
from .gates import long_gate, short_gate
from .indicators import add_indicators, last
from .portfolio import apply_portfolio_constraints, rank_candidates
from .quality import check_daily
from .regime import classify_regime
from .risk import plan_long, plan_short
from .scoring import LongFeatures, score_long, score_short
from .types import (
    Candidate,
    OpenPosition,
    PortfolioBudget,
    Regime,
    RegimeResult,
    ScanInputs,
    ScanResult,
    Side,
    SymbolInput,
    SymbolOutcome,
    SymbolStatus,
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


def scan_symbol(
    inp: SymbolInput,
    regime: RegimeResult,
    nifty_close: pd.Series | None,
    ban_list: frozenset[str] | None,
    session_date: date,
    cfg: ScanConfig,
) -> tuple[list[Candidate], SymbolStatus]:
    sym = inp.symbol
    problems = check_daily(inp.daily, session_date, cfg)
    if problems:
        return [], SymbolStatus(sym, "quality", SymbolOutcome.DATA_UNAVAILABLE, tuple(problems))
    assert inp.daily is not None
    df = add_indicators(inp.daily)
    close = float(df["close"].iloc[-1])
    last_date = pd.Timestamp(df.index[-1]).date().isoformat()
    atr = last(df, "atr14")
    ind = {c: last(df, c) for c in INDICATOR_COLS}
    f = inp.fundamentals
    sector = inp.sector or (f.sector if f else None)
    name = inp.name or (f.name if f else None)

    out: list[Candidate] = []
    reasons: list[str] = []
    stage = "gates"
    excluded = False

    # ---------------- long path ----------------
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
                    rs = rs_vs_index(df["close"], nifty_close, cfg.rs_lookback_bars)
                    feats = LongFeatures(leg, v, bp, cc, rs, f)
                    sc = score_long(feats, cfg)
                    stage = "scoring"
                    if sc.raw < cfg.min_score_long:
                        reasons.append(f"long:score {sc.raw:g} < {cfg.min_score_long:g}")
                    else:
                        stage = "plan"
                        plan = None
                        if atr is not None:
                            plan = plan_long(close, float(df["low"].iloc[-2]), atr, regime, cfg, inp.daily)
                        warnings = []
                        if plan is None:
                            warnings.append("no_plan:risk_per_share<=0 or ATR unavailable")
                        out.append(
                            Candidate(
                                symbol=sym, side=Side.LONG, sector=sector, name=name, close=close, last_bar_date=last_date,
                                score=sc, plan=plan, gate=g, leg=leg, vcp=v, bar_pattern=bp, colour_change=cc,
                                rs_vs_nifty=rs, fundamentals=f, indicators=ind, warnings=tuple(warnings),
                                reason_text=_long_reason(leg, v, bp, cc, f),
                            )
                        )

    # ---------------- short path ----------------
    if regime.shorts_allowed:
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
                else:
                    warnings = []
                    banned = ban_list is not None and sym in ban_list
                    if banned:
                        reasons.append("short:banned")
                        return out, SymbolStatus(sym, "ban_check", SymbolOutcome.BANNED, tuple(reasons)) if not out else SymbolStatus(sym, "plan", SymbolOutcome.CANDIDATE, tuple(reasons))
                    if ban_list is None:
                        if cfg.require_ban_list:
                            reasons.append("short:ban_list_unavailable (require_ban_list=true)")
                            s = None
                        else:
                            warnings.append("ban_list_unavailable: F&O ban status could not be verified")
                    if s is not None:
                        plan = plan_short(close, atr, regime, cfg) if atr is not None else None
                        if plan is None:
                            warnings.append("no_plan:risk_per_share<=0 or ATR unavailable")
                        out.append(
                            Candidate(
                                symbol=sym, side=Side.SHORT, sector=sector, name=name, close=close, last_bar_date=last_date,
                                score=sc, plan=plan, gate=g, short_signals=s, fundamentals=f, indicators=ind,
                                warnings=tuple(warnings), reason_text=_short_reason(s),
                            )
                        )

    if out:
        return out, SymbolStatus(sym, "plan", SymbolOutcome.CANDIDATE, tuple(reasons))
    if excluded:
        return out, SymbolStatus(sym, "gates", SymbolOutcome.FUNDAMENTALS_MISSING, tuple(reasons))
    if stage == "gates":
        return out, SymbolStatus(sym, stage, SymbolOutcome.REJECTED_GATE, tuple(reasons))
    if stage == "scoring":
        return out, SymbolStatus(sym, stage, SymbolOutcome.BELOW_MIN_SCORE, tuple(reasons))
    return out, SymbolStatus(sym, stage, SymbolOutcome.NO_SETUP, tuple(reasons))


def scan_universe(inputs: ScanInputs, cfg: ScanConfig, open_positions: list[OpenPosition] | None = None) -> ScanResult:
    open_positions = open_positions or []
    regime = classify_regime(inputs.nifty_daily, inputs.vix_close, inputs.smallcap_daily, cfg)
    warnings: list[str] = []
    session = inputs.session_date.isoformat()
    ban_available = inputs.ban_list is not None
    if not ban_available:
        warnings.append("ban_list_unavailable")

    if regime.regime is Regime.UNKNOWN:
        statuses = tuple(SymbolStatus(s.symbol, "regime", SymbolOutcome.NO_SETUP, ("not_scanned:regime_unknown",)) for s in sorted(inputs.symbols, key=lambda s: s.symbol))
        warnings.append("regime_unknown:no_scan")
        return ScanResult(session, regime, (), statuses, {"universe": inputs.universe_size, "scanned": 0}, tuple(warnings), ban_available, False, None)

    nifty_close = inputs.nifty_daily["close"] if inputs.nifty_daily is not None else None
    cands: list[Candidate] = []
    statuses: list[SymbolStatus] = []
    for inp in sorted(inputs.symbols, key=lambda s: s.symbol):
        c, st = scan_symbol(inp, regime, nifty_close, inputs.ban_list, inputs.session_date, cfg)
        cands.extend(c)
        statuses.append(st)

    ranked = rank_candidates(cands, cfg)
    final, budget = apply_portfolio_constraints(ranked, open_positions, cfg)

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
        "deferred": sum(1 for c in final if c.rank_status is not None and c.rank_status.value.startswith("deferred")),
    }
    return ScanResult(session, regime, tuple(final), tuple(statuses), counts, tuple(warnings), ban_available, True, budget)
