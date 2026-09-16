import { useMemo } from "react";
import { useIndexMembership } from "./dataClient";
import type { Scope } from "../components/SearchBox";
import type { UniverseRow } from "./types";
import { useWatchlist } from "./watchlist";
import { fuzzyRow } from "./fuzzy";

/** Scope + fuzzy-search filter shared by the Universe and Screeners pages. */
export function useScopeFilter(rows: UniverseRow[], scope: Scope, q: string) {
  const idx = useIndexMembership();
  const watch = useWatchlist();
  const sets = idx.data?.sets;
  return useMemo(() => {
    const inScope = (r: UniverseRow) => {
      if (scope === "ALL") return true;
      if (scope === "FNO") return r.fno_eligible;
      if (scope === "WATCH") return watch.includes(r.symbol);
      return sets ? sets[scope]?.includes(r.symbol) ?? false : true;
    };
    const scoped = rows.filter(inScope);
    if (!q.trim()) return { rows: scoped, indexAvailable: !!sets, counts: countScopes(rows, sets, watch) };
    const scored = scoped.map((r) => ({ r, s: fuzzyRow(q, r) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    return { rows: scored.map((x) => x.r), indexAvailable: !!sets, counts: countScopes(rows, sets, watch) };
  }, [rows, scope, q, sets, watch]);
}

function countScopes(rows: UniverseRow[], sets: Record<string, string[]> | undefined, watch: string[]): Partial<Record<Scope, number>> {
  const syms = new Set(rows.map((r) => r.symbol));
  const c: Partial<Record<Scope, number>> = { ALL: rows.length, FNO: rows.filter((r) => r.fno_eligible).length, WATCH: watch.filter((s) => syms.has(s)).length };
  if (sets) for (const k of ["NIFTY50", "NIFTY200", "SMALLCAP250"] as const) c[k] = sets[k]?.filter((s) => syms.has(s)).length ?? 0;
  return c;
}
