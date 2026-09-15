// Re-apply portfolio constraints in the browser against the local journal's open positions.
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { db } from "./db";
import { applyPortfolioConstraints, rankCandidates, type ConstraintConfig, type RankedCandidate } from "./portfolio";
import type { Candidate, ConfigProfile } from "./types";

export function constraintConfigFrom(profile: ConfigProfile | undefined): ConstraintConfig | null {
  if (!profile) return null;
  const v = profile.values as Record<string, number | boolean>;
  return {
    capital: v.capital as number,
    max_portfolio_risk_pct: v.max_portfolio_risk_pct as number,
    max_gross_exposure_pct: v.max_gross_exposure_pct as number,
    max_concurrent_positions: v.max_concurrent_positions as number,
    max_positions_per_sector: v.max_positions_per_sector as number,
    allow_pyramiding: v.allow_pyramiding as boolean,
    top_n_longs: v.top_n_longs as number,
    top_n_shorts: v.top_n_shorts as number,
  };
}

export function useLocalConstraints(cands: Candidate[] | undefined, profile: ConfigProfile | undefined) {
  const open = useLiveQuery(() => db.journal.where("status").equals("open").toArray(), []);
  return useMemo(() => {
    const cfg = constraintConfigFrom(profile);
    if (!cands || !cfg || open === undefined) return null;
    const slim = cands.map((c) => ({
      symbol: c.symbol, side: c.side, sector: c.sector, raw: c.score.raw,
      qty: c.plan?.qty ?? 0, position_value: c.plan?.position_value ?? 0, risk_amount: c.plan?.risk_amount ?? 0,
    }));
    const openLike = open.map((t) => ({
      symbol: t.symbol, side: t.side, sector: t.sector,
      position_value: (t.fill_price ?? t.planned_entry) * t.qty,
      risk_amount: Math.abs((t.fill_price ?? t.planned_entry) - t.stop) * t.qty,
    }));
    const { results, budget } = applyPortfolioConstraints(rankCandidates(slim, cfg), openLike, cfg);
    const bySymbol = new Map<string, RankedCandidate>();
    for (const r of results) bySymbol.set(`${r.symbol}:${r.side}`, r);
    return { bySymbol, budget, openCount: open.length };
  }, [cands, profile, open]);
}
