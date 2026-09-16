import type { Candidate, Grade } from "../lib/types";
import { cmpNum, type SortDir, type SortState } from "../lib/sort";
import { IconSort } from "./icons";

export type CardSortKey = "grade" | "score" | "rr" | "rs" | "stop" | "target" | "symbol";
export const CARD_SORT_LABEL: Record<CardSortKey, string> = { grade: "Grade", score: "Score", rr: "Reward : risk", rs: "RS vs Nifty", stop: "Stop distance", target: "Target %", symbol: "Symbol" };
export const CARD_SORT_DEFAULT_DIR: Record<CardSortKey, SortDir> = { grade: "desc", score: "desc", rr: "desc", rs: "desc", stop: "asc", target: "desc", symbol: "asc" };
const GRADE_RANK: Record<Grade, number> = { "A++": 5, "A+": 4, A: 3, "B+": 2, B: 1 };

export function candidateComparator(s: SortState<CardSortKey>): (a: Candidate, b: Candidate) => number {
  const tie = (a: Candidate, b: Candidate) => (a.rank ?? 999) - (b.rank ?? 999) || b.score.raw - a.score.raw || a.symbol.localeCompare(b.symbol);
  switch (s.key) {
    case "grade": return (a, b) => cmpNum(a.grade ? GRADE_RANK[a.grade.grade] : null, b.grade ? GRADE_RANK[b.grade.grade] : null, s.dir) || tie(a, b);
    case "score": return (a, b) => cmpNum(a.score.raw, b.score.raw, s.dir) || tie(a, b);
    case "rr": return (a, b) => cmpNum(a.plan?.reward_risk, b.plan?.reward_risk, s.dir) || tie(a, b);
    case "rs": return (a, b) => cmpNum(a.rs_vs_nifty, b.rs_vs_nifty, s.dir) || tie(a, b);
    case "stop": return (a, b) => cmpNum(a.plan?.stop_distance_pct, b.plan?.stop_distance_pct, s.dir) || tie(a, b);
    case "target": return (a, b) => cmpNum(a.plan?.target_pct, b.plan?.target_pct, s.dir) || tie(a, b);
    case "symbol": return (a, b) => (s.dir === "asc" ? 1 : -1) * a.symbol.localeCompare(b.symbol);
  }
}

export default function CardSortBar({ sort, onToggle, keys = ["grade", "score", "rr", "rs", "stop", "target"] }: { sort: SortState<CardSortKey>; onToggle: (k: CardSortKey) => void; keys?: CardSortKey[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Sort setups">
      <span className="label mr-1">Sort</span>
      {keys.map((k) => {
        const on = sort.key === k;
        return (
          <button key={k} type="button" className="pill" aria-pressed={on} onClick={() => onToggle(k)} title={on ? `Sorted ${sort.dir === "desc" ? "highest to lowest" : "lowest to highest"}; click to flip` : `Sort by ${CARD_SORT_LABEL[k].toLowerCase()}`} data-sort-key={k} data-sort-dir={on ? sort.dir : undefined}>
            {CARD_SORT_LABEL[k]}
            {on && <IconSort size={12} style={{ transform: sort.dir === "asc" ? "rotate(180deg)" : undefined, opacity: 1 }} />}
          </button>
        );
      })}
    </div>
  );
}
