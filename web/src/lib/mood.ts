// Market Mood: a 0–100 gauge computed from this site's own end-of-day inputs (Nifty trend, India VIX,
// and market breadth aggregates the scanner stores in run.json). It is NOT Tickertape's proprietary
// MMI and uses none of its inputs (FII flows, gold demand); the zone names follow the same convention
// so the reading is familiar. Every component is a plain count or ratio; nothing is modelled.
import type { Run } from "./types";

export type MoodZone = "extreme_fear" | "fear" | "greed" | "extreme_greed";
export interface MoodComponent { key: string; label: string; value: number; raw: string; how: string }
export interface MoodResult { score: number; zone: MoodZone; components: MoodComponent[]; complete: boolean; session: string }

export const ZONE_LABEL: Record<MoodZone, string> = { extreme_fear: "Extreme fear", fear: "Fear", greed: "Greed", extreme_greed: "Extreme greed" };
export function moodZone(score: number): MoodZone { return score < 30 ? "extreme_fear" : score < 50 ? "fear" : score < 70 ? "greed" : "extreme_greed"; }

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lin = (x: number, lo: number, hi: number) => 100 * clamp01((x - lo) / (hi - lo));

export function computeMood(run: Run): MoodResult | null {
  const r = run.regime, c = run.counts;
  const parts: MoodComponent[] = [];
  if (r.nifty_close != null && r.nifty_ema_slow != null && r.nifty_ema_slow > 0) {
    const d = (r.nifty_close / r.nifty_ema_slow - 1) * 100;
    parts.push({ key: "trend", label: "Nifty trend", value: lin(d, -4, 4), raw: `${d >= 0 ? "+" : ""}${d.toFixed(1)}% vs 20-day EMA`, how: "Nifty close relative to its 20-day EMA: -4% reads 0, +4% reads 100." });
  }
  if (r.vix != null) parts.push({ key: "vix", label: "Volatility (India VIX)", value: lin(r.vix, 30, 10), raw: `VIX ${r.vix.toFixed(2)}`, how: "India VIX inverted: 30 reads 0 (fear), 10 reads 100 (calm)." });
  const n = c.breadth_n ?? 0;
  const complete = n > 0;
  if (complete) {
    const pct = (k: string) => (100 * (c[k] ?? 0)) / n;
    parts.push({ key: "breadth", label: "Breadth", value: (pct("breadth_above_ema200") + pct("breadth_above_ema50")) / 2, raw: `${pct("breadth_above_ema200").toFixed(0)}% above EMA200 · ${pct("breadth_above_ema50").toFixed(0)}% above EMA50`, how: "Average of the share of stocks above their 200-day and 50-day EMAs." });
    parts.push({ key: "momentum", label: "Momentum", value: pct("breadth_roc20_positive"), raw: `${pct("breadth_roc20_positive").toFixed(0)}% up over 20 sessions`, how: "Share of stocks whose 20-session change is positive." });
    if (c.breadth_median_rsi14 != null) parts.push({ key: "rsi", label: "Price strength", value: lin(c.breadth_median_rsi14, 30, 70), raw: `median RSI ${c.breadth_median_rsi14.toFixed(0)}`, how: "Median RSI(14) across the universe: 30 reads 0, 70 reads 100." });
    const hi = c.breadth_near_52w_high ?? 0, lo = c.breadth_near_52w_low ?? 0;
    if (hi + lo > 0) parts.push({ key: "highs", label: "New highs vs lows", value: (100 * hi) / (hi + lo), raw: `${hi} within 5% of 52w high · ${lo} within 5% of 52w low`, how: "Stocks near their 52-week high as a share of those near either extreme." });
  }
  if (parts.length === 0) return null;
  const score = parts.reduce((s, p) => s + p.value, 0) / parts.length;
  return { score, zone: moodZone(score), components: parts, complete, session: run.session_date };
}
