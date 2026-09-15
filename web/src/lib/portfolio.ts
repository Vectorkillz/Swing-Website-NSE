// Line-for-line port of engine/portfolio.py::apply_portfolio_constraints.
// Verified against data/test_vectors/portfolio_constraints.json (see portfolio.test.ts).
// All money arithmetic is in integer paise so Python and JS agree exactly.

import type { RankStatus, Side } from "./types";

export interface ConstraintConfig {
  capital: number;
  max_portfolio_risk_pct: number;
  max_gross_exposure_pct: number;
  max_concurrent_positions: number;
  max_positions_per_sector: number;
  allow_pyramiding: boolean;
  top_n_longs: number;
  top_n_shorts: number;
}

export interface SlimCandidate {
  symbol: string;
  side: Side;
  sector: string | null;
  raw: number;
  qty: number;
  position_value: number;
  risk_amount: number;
}

export interface OpenPositionLike {
  symbol: string;
  side: Side;
  sector: string | null;
  position_value: number;
  risk_amount: number;
}

export interface RankedCandidate extends SlimCandidate {
  rank: number | null;
  rank_status: RankStatus | null;
  rank_reason: string | null;
}

export interface Budget {
  capital: number;
  open_positions: number;
  open_gross_value: number;
  open_risk_amount: number;
  accepted_positions: number;
  accepted_gross_value: number;
  accepted_risk_amount: number;
  gross_cap: number;
  risk_cap: number;
  per_sector: Record<string, number>;
}

export function paise(x: number): number {
  return Math.round(x * 100);
}

function cmp(a: RankedCandidate, b: RankedCandidate): number {
  if (b.raw !== a.raw) return b.raw - a.raw;
  return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
}

export function rankCandidates(cands: SlimCandidate[], cfg: ConstraintConfig): RankedCandidate[] {
  const out: RankedCandidate[] = [];
  const sides: [Side, number][] = [["long", cfg.top_n_longs], ["short", cfg.top_n_shorts]];
  for (const [side, topN] of sides) {
    const pool = cands.filter((c) => c.side === side).map((c) => ({ ...c, rank: null as number | null, rank_status: null as RankStatus | null, rank_reason: null as string | null }));
    pool.sort(cmp);
    let kept = 0;
    for (const c of pool) {
      if (c.qty <= 0) {
        out.push({ ...c, rank: null, rank_status: null, rank_reason: "no sized plan" });
        continue;
      }
      if (kept < topN) {
        kept += 1;
        out.push({ ...c, rank: kept, rank_status: "ranked", rank_reason: null });
      } else {
        out.push({ ...c, rank: null, rank_status: "not_in_top_n", rank_reason: `outside top ${topN}` });
      }
    }
  }
  return out;
}

function orderKey(c: RankedCandidate): [number, number, string] {
  return [c.side === "long" ? 0 : 1, c.rank ?? 1e9, c.symbol];
}

function byOrder(a: RankedCandidate, b: RankedCandidate): number {
  const ka = orderKey(a), kb = orderKey(b);
  if (ka[0] !== kb[0]) return ka[0] - kb[0];
  if (ka[1] !== kb[1]) return ka[1] - kb[1];
  return ka[2] < kb[2] ? -1 : ka[2] > kb[2] ? 1 : 0;
}

export function applyPortfolioConstraints(
  ranked: RankedCandidate[],
  openPositions: OpenPositionLike[],
  cfg: ConstraintConfig,
): { results: RankedCandidate[]; budget: Budget } {
  const capP = paise(cfg.capital);
  const grossCapP = Math.round((capP * cfg.max_gross_exposure_pct) / 100.0);
  const riskCapP = Math.round((capP * cfg.max_portfolio_risk_pct) / 100.0);

  const openGross = openPositions.reduce((s, p) => s + paise(p.position_value), 0);
  const openRisk = openPositions.reduce((s, p) => s + paise(p.risk_amount), 0);
  let positions = openPositions.length;
  const perSector: Record<string, number> = {};
  const held = new Set<string>();
  for (const p of openPositions) {
    const sec = p.sector ?? "UNKNOWN";
    perSector[sec] = (perSector[sec] ?? 0) + 1;
    held.add(p.symbol);
  }

  let gross = openGross, risk = openRisk, accGross = 0, accRisk = 0, accN = 0;
  const result: RankedCandidate[] = [];
  for (const c of [...ranked].sort(byOrder)) {
    if (c.rank_status !== "ranked") {
      result.push(c);
      continue;
    }
    const sector = c.sector ?? "UNKNOWN";
    const pv = paise(c.position_value);
    const ra = paise(c.risk_amount);
    if (held.has(c.symbol) && c.side === "long" && !cfg.allow_pyramiding) {
      result.push({ ...c, rank_status: "already_held", rank_reason: "open position exists and allow_pyramiding=false" });
      continue;
    }
    if (positions + 1 > cfg.max_concurrent_positions) {
      result.push({ ...c, rank_status: "deferred_max_positions", rank_reason: `max_concurrent_positions ${cfg.max_concurrent_positions} reached` });
      continue;
    }
    if ((perSector[sector] ?? 0) + 1 > cfg.max_positions_per_sector) {
      result.push({ ...c, rank_status: "deferred_sector_cap", rank_reason: `max_positions_per_sector ${cfg.max_positions_per_sector} reached for ${sector}` });
      continue;
    }
    if (gross + pv > grossCapP) {
      result.push({ ...c, rank_status: "deferred_gross_exposure", rank_reason: `gross exposure would exceed ${cfg.max_gross_exposure_pct}% of capital` });
      continue;
    }
    if (risk + ra > riskCapP) {
      result.push({ ...c, rank_status: "deferred_risk_budget", rank_reason: `portfolio risk would exceed ${cfg.max_portfolio_risk_pct}% of capital` });
      continue;
    }
    gross += pv; risk += ra; accGross += pv; accRisk += ra; accN += 1; positions += 1;
    perSector[sector] = (perSector[sector] ?? 0) + 1;
    held.add(c.symbol);
    result.push(c);
  }
  result.sort(byOrder);
  const sortedSector: Record<string, number> = {};
  for (const k of Object.keys(perSector).sort()) sortedSector[k] = perSector[k];
  return {
    results: result,
    budget: {
      capital: cfg.capital,
      open_positions: openPositions.length,
      open_gross_value: openGross / 100,
      open_risk_amount: openRisk / 100,
      accepted_positions: accN,
      accepted_gross_value: accGross / 100,
      accepted_risk_amount: accRisk / 100,
      gross_cap: grossCapP / 100,
      risk_cap: riskCapP / 100,
      per_sector: sortedSector,
    },
  };
}
