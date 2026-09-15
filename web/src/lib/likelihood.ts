// Empirical outcome statistics from the journal. Mirrors engine/likelihood.py.
// No modelled percentage is ever shown; below the sample threshold only bands are displayed.

export interface ClosedTradeLike {
  score_raw: number;
  realised_r: number;
}

export interface DecileStat {
  decile: number;
  score_min: number;
  score_max: number;
  n: number;
  hit_rate: number | null;
  avg_r: number | null;
}

export function calibrationReady(nClosed: number, minSamples: number): boolean {
  return nClosed >= minSamples;
}

export function decileStats(closed: ClosedTradeLike[], maxPossible: number): DecileStat[] {
  const width = maxPossible / 10;
  const out: DecileStat[] = [];
  for (let d = 1; d <= 10; d++) {
    const lo = (d - 1) * width, hi = d * width;
    const bucket = closed.filter((t) => (lo <= t.score_raw && t.score_raw < hi) || (d === 10 && t.score_raw >= hi));
    const n = bucket.length;
    out.push({
      decile: d,
      score_min: lo,
      score_max: hi,
      n,
      hit_rate: n ? bucket.filter((t) => t.realised_r > 0).length / n : null,
      avg_r: n ? bucket.reduce((s, t) => s + t.realised_r, 0) / n : null,
    });
  }
  return out;
}

export function bandFor(raw: number, aMin: number, bMin: number): "A" | "B" | "C" {
  if (raw >= aMin) return "A";
  if (raw >= bMin) return "B";
  return "C";
}
