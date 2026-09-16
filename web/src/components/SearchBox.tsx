import type { IndexSet } from "../lib/types";

export const INDEX_SETS: { key: IndexSet | "ALL" | "FNO" | "WATCH"; label: string }[] = [
  { key: "ALL", label: "All NSE" },
  { key: "NIFTY50", label: "Nifty 50" },
  { key: "NIFTY200", label: "Nifty 200" },
  { key: "SMALLCAP250", label: "Smallcap 250" },
  { key: "FNO", label: "F&O" },
  { key: "WATCH", label: "★ Watchlist" },
];
export type Scope = (typeof INDEX_SETS)[number]["key"];

/** Fuzzy search input + scope pills (index membership, F&O, watchlist). */
export default function SearchBox({ q, onQ, scope, onScope, counts, disabledScopes = [] }: { q: string; onQ: (s: string) => void; scope: Scope; onScope: (s: Scope) => void; counts?: Partial<Record<Scope, number>>; disabledScopes?: Scope[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input className="input w-56" placeholder="Search symbol, company or sector" value={q} onChange={(e) => onQ(e.target.value)} aria-label="Search" data-testid="search" />
      <div className="flex flex-wrap gap-1" role="group" aria-label="Search scope">
        {INDEX_SETS.map((s) => {
          const off = disabledScopes.includes(s.key);
          return <button key={s.key} type="button" className="pill pill-sm" aria-pressed={scope === s.key} disabled={off} title={off ? "Index membership file not available" : undefined} onClick={() => onScope(s.key)}>{s.label}{counts?.[s.key] != null ? <span className="ml-1 opacity-60">{counts[s.key]}</span> : null}</button>;
        })}
      </div>
    </div>
  );
}
