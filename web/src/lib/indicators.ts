// Client-side indicator helpers for chart overlays. Same definitions as engine/indicators.py
// (EMA seeded with SMA(n); Wilder RSI) so a value shown here matches the engine's stored one.

export function ema(values: (number | null)[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  const v = values.map((x) => (x == null ? NaN : x));
  if (v.length < n) return out;
  let s = 0;
  for (let i = 0; i < n; i++) s += v[i];
  let prev = s / n;
  out[n - 1] = prev;
  const a = 2 / (n + 1);
  for (let i = n; i < v.length; i++) { prev = a * v[i] + (1 - a) * prev; out[i] = prev; }
  return out;
}

export function rsiWilder(close: number[], n = 14): (number | null)[] {
  const out: (number | null)[] = new Array(close.length).fill(null);
  if (close.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = close[i] - close[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= n; l /= n;
  const f = (gg: number, ll: number) => (ll === 0 ? (gg > 0 ? 100 : 50) : 100 - 100 / (1 + gg / ll));
  out[n] = f(g, l);
  for (let i = n + 1; i < close.length; i++) {
    const d = close[i] - close[i - 1];
    g = (g * (n - 1) + (d > 0 ? d : 0)) / n;
    l = (l * (n - 1) + (d < 0 ? -d : 0)) / n;
    out[i] = f(g, l);
  }
  return out;
}

/** Anchored VWAP from daily bars: cumulative Σ(typical price × volume) / Σ volume from `anchorIdx`.
 *  Daily bars cannot reproduce a true intraday VWAP; this is the swing-trader's anchored variant. */
export function anchoredVwap(bars: { h: number; l: number; c: number; v: number }[], anchorIdx: number): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  let pv = 0, vol = 0;
  for (let i = Math.max(0, anchorIdx); i < bars.length; i++) {
    const tp = (bars[i].h + bars[i].l + bars[i].c) / 3;
    pv += tp * bars[i].v; vol += bars[i].v;
    out[i] = vol > 0 ? pv / vol : null;
  }
  return out;
}
