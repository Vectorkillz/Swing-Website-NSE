// Turns the structured detector output of a candidate (or a universe row) into a short summary and
// a list of technical reasoning points. Everything here is a restatement of fields the engine already
// computed and stored — nothing is inferred or forecast on the client.
import type { Candidate, UniverseRow } from "./types";
import { fmtInr, fmtNum, fmtPct } from "./format";

export type Tone = "bull" | "bear" | "neutral" | "warn";
export interface ReasonPoint { title: string; detail: string; tone: Tone }
export interface Reasoning { summary: string; points: ReasonPoint[] }

function pct(x: number | null | undefined, d = 1) { return fmtPct(x, d); }

export function buildCandidateReasoning(c: Candidate): Reasoning {
  const pts: ReasonPoint[] = [];
  const long = c.side === "long";
  const ctx = c.context;

  if (long) {
    if (c.vcp?.stage2) pts.push({ title: "Stage 2 uptrend", detail: "Close above EMA200 and EMA50 above EMA200: the long-term trend structure is up.", tone: "bull" });
    if (c.leg?.found && c.leg.move_pct != null) {
      pts.push({ title: `Momentum leg +${c.leg.move_pct.toFixed(1)}%`, detail: `Best 22-bar advance inside the last 42 bars ran ${c.leg.start_date} → ${c.leg.end_date}${c.leg.max_daily_pct != null ? `, largest single day +${c.leg.max_daily_pct.toFixed(1)}%` : ""}${c.leg.age_bars != null ? `; leg ended ${c.leg.age_bars} bars ago` : ""}.`, tone: "bull" });
    }
    if (c.vcp?.valid && c.vcp.depth_pct != null) {
      pts.push({ title: `Tight pullback ${c.vcp.depth_pct.toFixed(1)}%`, detail: `Price has retraced ${c.vcp.depth_pct.toFixed(1)}% from the leg high while holding at or above EMA20 — a volatility-contraction pattern.`, tone: "bull" });
    }
    if (c.vcp?.vol_dry_pct != null) {
      const dry = c.vcp.vol_dry_pct < 50;
      pts.push({ title: dry ? "Volume dry-up" : "Volume not fully dried up", detail: `Recent volume is ${c.vcp.vol_dry_pct.toFixed(0)}% of the leg average${dry ? ": supply has thinned during the pullback." : "."}`, tone: dry ? "bull" : "neutral" });
    }
    if (c.bar_pattern?.kind) {
      pts.push({ title: c.bar_pattern.kind === "IB" ? "Inside bar" : "Mother bar", detail: `${c.bar_pattern.kind === "IB" ? "Latest bar sits inside the prior bar's range" : "A wide bar engulfs the following bars"}; trigger level ${fmtInr(c.bar_pattern.trigger)}.`, tone: "bull" });
    }
    if (c.colour_change) pts.push({ title: "Colour change", detail: "First green close after a run of red bars — a short-term shift in control.", tone: "bull" });
  } else {
    const s = c.short_signals;
    if (s?.stage4) pts.push({ title: "Stage 4 downtrend", detail: "Close below EMA50 and EMA200: the trend structure is down.", tone: "bear" });
    if (s?.downtrend) pts.push({ title: "Lower highs, lower lows", detail: "Sampled bars over the last 20 sessions keep stepping down.", tone: "bear" });
    if (s?.double_top) pts.push({ title: "Double top", detail: "Two highs within 3% of each other across the last 40 bars — a resistance zone that has held twice.", tone: "bear" });
    if (s?.weak_bounce) pts.push({ title: "Weak bounce", detail: `The rebound recovered only ${s.bounce_ratio != null ? (s.bounce_ratio * 100).toFixed(0) + "%" : "a small fraction"} of the prior decline.`, tone: "bear" });
    if (s?.low_vol_bounce) pts.push({ title: "Low-volume bounce", detail: "The bounce came on shrinking volume: little buying conviction.", tone: "bear" });
    if (s?.red_confirm) pts.push({ title: "Red confirmation", detail: "Latest bar closed below its open, confirming the rollover.", tone: "bear" });
  }

  if (c.rs_vs_nifty != null) {
    const strong = long ? c.rs_vs_nifty > 0 : c.rs_vs_nifty < 0;
    pts.push({ title: `Relative strength ${c.rs_vs_nifty >= 0 ? "+" : ""}${c.rs_vs_nifty.toFixed(1)} pp vs Nifty`, detail: `20-bar return minus Nifty's 20-bar return. ${strong ? (long ? "Leading the index." : "Lagging the index, as a short setup should.") : "Not confirming the setup direction."}`, tone: strong ? (long ? "bull" : "bear") : "neutral" });
  }
  if (ctx) {
    if (ctx.pct_from_52w_high != null) pts.push({ title: `${pct(ctx.pct_from_52w_high)} from 52-week high`, detail: `52-week range ${fmtInr(ctx.low_52w)} – ${fmtInr(ctx.high_52w)}; ${ctx.pct_above_52w_low != null ? `${pct(ctx.pct_above_52w_low)} above the low.` : ""}`, tone: "neutral" });
    if (ctx.atr_pct != null) pts.push({ title: `ATR ${pct(ctx.atr_pct)} of price`, detail: ctx.atr_pct < 1.5 ? "Below the 1.5% swing-tradability floor: moves may be too small to work a swing." : ctx.atr_pct > 8 ? "Above the 8% ceiling: stop distances get wide." : "Inside the 1.5–8% band the scanner treats as swing-tradable.", tone: ctx.atr_pct < 1.5 || ctx.atr_pct > 8 ? "warn" : "neutral" });
    if (ctx.avg_volume_20 != null) pts.push({ title: `Avg volume ${fmtNum(ctx.avg_volume_20)}`, detail: "20-day average traded quantity; liquidity gate for the setup.", tone: "neutral" });
  }
  if (c.grade) pts.push({ title: `Grade ${c.grade.grade}`, detail: c.grade.reasons.join(" · "), tone: c.grade.grade.startsWith("A") ? (long ? "bull" : "bear") : "neutral" });
  for (const w of c.warnings) pts.push({ title: "Caution", detail: w, tone: "warn" });

  const p = c.plan;
  const summary = long
    ? `${c.symbol} is a ${c.vcp?.stage2 ? "Stage 2 " : ""}long setup: a ${c.leg?.move_pct != null ? `+${c.leg.move_pct.toFixed(0)}% ` : ""}momentum leg followed by a ${c.vcp?.depth_pct != null ? `${c.vcp.depth_pct.toFixed(0)}% ` : ""}pullback on lighter volume${c.bar_pattern?.kind ? ` with an ${c.bar_pattern.kind === "IB" ? "inside-bar" : "mother-bar"} trigger` : ""}. Scored ${c.score.raw.toFixed(0)} of ${c.score.max_possible.toFixed(0)} points${c.grade ? `, grade ${c.grade.grade}` : ""}.${p ? ` Zone ${fmtInr(p.entry)}${p.entry_max != null ? `–${fmtInr(p.entry_max)}` : ""}, stop ${fmtInr(p.stop)} (${pct(p.stop_distance_pct)}), target ${fmtInr(p.target)} (${p.reward_risk.toFixed(1)}R).` : ""}`
    : `${c.symbol} is a short setup: ${[c.short_signals?.stage4 && "Stage 4 trend", c.short_signals?.double_top && "double top", c.short_signals?.weak_bounce && "weak bounce", c.short_signals?.downtrend && "lower highs/lows"].filter(Boolean).join(", ") || "bearish structure"}. Scored ${c.score.raw.toFixed(0)} of ${c.score.max_possible.toFixed(0)} points${c.grade ? `, grade ${c.grade.grade}` : ""}.${p ? ` Zone ${fmtInr(p.entry)}, stop ${fmtInr(p.stop)} (${pct(p.stop_distance_pct)}), target ${fmtInr(p.target)} (${p.reward_risk.toFixed(1)}R).` : ""}`;
  return { summary, points: pts };
}

export function buildRowReasoning(r: UniverseRow): Reasoning {
  const pts: ReasonPoint[] = [];
  const ctx = r.context;
  if (r.stage === "stage2") pts.push({ title: "Stage 2 uptrend", detail: "Close above EMA200 and EMA50 above EMA200.", tone: "bull" });
  else if (r.stage === "stage4") pts.push({ title: "Stage 4 downtrend", detail: "Close below EMA50 and EMA200.", tone: "bear" });
  else pts.push({ title: "Transitional trend", detail: "Moving averages are not aligned in either direction.", tone: "neutral" });
  if (r.above_ema50 != null) pts.push({ title: r.above_ema50 ? "Above EMA50" : "Below EMA50", detail: r.above_ema200 == null ? "" : r.above_ema200 ? "Also above EMA200." : "Below EMA200.", tone: r.above_ema50 ? "bull" : "bear" });
  if (r.rs_vs_nifty != null) pts.push({ title: `Relative strength ${r.rs_vs_nifty >= 0 ? "+" : ""}${r.rs_vs_nifty.toFixed(1)} pp`, detail: "20-bar return minus Nifty's 20-bar return.", tone: r.rs_vs_nifty > 0 ? "bull" : r.rs_vs_nifty < 0 ? "bear" : "neutral" });
  if (ctx?.roc_20 != null) pts.push({ title: `20-bar change ${pct(ctx.roc_20)}`, detail: "Percentage move over the last 20 sessions.", tone: ctx.roc_20 > 0 ? "bull" : ctx.roc_20 < 0 ? "bear" : "neutral" });
  if (ctx?.pct_from_52w_high != null) pts.push({ title: `${pct(ctx.pct_from_52w_high)} from 52-week high`, detail: `Range ${fmtInr(ctx.low_52w)} – ${fmtInr(ctx.high_52w)}.`, tone: "neutral" });
  if (ctx?.atr_pct != null) pts.push({ title: `ATR ${pct(ctx.atr_pct)}`, detail: r.swing_suitable ? "Inside the swing-tradable volatility band." : r.swing_notes.join("; ") || "Outside the swing-tradable band.", tone: r.swing_suitable ? "neutral" : "warn" });
  if (ctx?.rsi14 != null) pts.push({ title: `RSI(14) ${ctx.rsi14.toFixed(0)}`, detail: ctx.rsi14 >= 70 ? "Above 70: strong momentum, stretched short-term." : ctx.rsi14 >= 50 ? "Above 50: momentum on the buyers' side." : ctx.rsi14 > 30 ? "Below 50: momentum on the sellers' side." : "Below 30: heavily sold, stretched short-term.", tone: ctx.rsi14 >= 50 ? "bull" : "bear" });
  if (ctx?.vol_ratio_20 != null) pts.push({ title: `Volume ${ctx.vol_ratio_20.toFixed(1)}× 20-day average`, detail: ctx.vol_ratio_20 >= 2 ? "Latest bar traded at least twice its normal volume: a participation surge." : ctx.vol_ratio_20 < 0.6 ? "Quiet session relative to its average." : "Normal participation.", tone: ctx.vol_ratio_20 >= 2 ? (ctx.roc_20 != null && ctx.roc_20 < 0 ? "bear" : "bull") : "neutral" });
  if (ctx?.pct_from_20d_high != null) pts.push({ title: ctx.pct_from_20d_high >= 0 ? `Above the prior 20-day high by ${pct(ctx.pct_from_20d_high)}` : `${pct(-ctx.pct_from_20d_high)} below the 20-day high`, detail: ctx.pct_from_20d_high >= 0 ? "Close has cleared the highest high of the previous 20 sessions." : "Resistance from the last 20 sessions sits overhead.", tone: ctx.pct_from_20d_high >= 0 ? "bull" : "neutral" });
  if (ctx?.dist_ema20_pct != null) pts.push({ title: `${Math.abs(ctx.dist_ema20_pct).toFixed(1)}% ${ctx.dist_ema20_pct >= 0 ? "above" : "below"} EMA20`, detail: ctx.dist_ema50_pct != null ? `${Math.abs(ctx.dist_ema50_pct).toFixed(1)}% ${ctx.dist_ema50_pct >= 0 ? "above" : "below"} EMA50.` : "", tone: ctx.dist_ema20_pct >= 0 ? "bull" : "bear" });
  if (ctx?.higher_highs_lows != null) pts.push({ title: ctx.higher_highs_lows ? "Higher highs and higher lows" : "No higher-high / higher-low structure", detail: "Last 20 sessions compared with the 20 before them.", tone: ctx.higher_highs_lows ? "bull" : "neutral" });
  if (r.multibagger && r.multibagger.level !== "none") pts.push({ title: `Multibagger ${r.multibagger.level}`, detail: `${r.multibagger.technical_met}/${r.multibagger.technical_total} trend-template criteria met${r.multibagger.growth_met ? ", growth confirmed" : ""}. Heuristic checklist, not a forecast.`, tone: "bull" });
  if (r.setup_side) pts.push({ title: `${r.setup_side === "long" ? "Long" : "Short"} setup this session`, detail: "Open it from the Scanner tab for full levels.", tone: r.setup_side === "long" ? "bull" : "bear" });
  else pts.push({ title: "No setup this session", detail: `Scanner outcome: ${r.outcome.replace(/_/g, " ")}.`, tone: "neutral" });
  const summary = `${r.symbol}${r.name ? ` (${r.name})` : ""} is in a ${r.stage === "stage2" ? "Stage 2 uptrend" : r.stage === "stage4" ? "Stage 4 downtrend" : "transitional trend"}${r.rs_vs_nifty != null ? `, ${r.rs_vs_nifty >= 0 ? "out" : "under"}performing Nifty by ${Math.abs(r.rs_vs_nifty).toFixed(1)} pp over 20 bars` : ""}${ctx?.pct_from_52w_high != null ? `, ${pct(ctx.pct_from_52w_high)} from its 52-week high` : ""}.`;
  return { summary, points: pts };
}
