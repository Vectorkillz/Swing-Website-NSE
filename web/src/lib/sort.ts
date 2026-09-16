import { useCallback, useMemo, useState } from "react";

export type SortDir = "asc" | "desc";
export interface SortState<K extends string> { key: K; dir: SortDir }

/** Nulls always sort last regardless of direction. */
export function cmpNum(a: number | null | undefined, b: number | null | undefined, dir: SortDir): number {
  const an = a == null || Number.isNaN(a), bn = b == null || Number.isNaN(b);
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  return dir === "asc" ? (a as number) - (b as number) : (b as number) - (a as number);
}
export function cmpStr(a: string | null | undefined, b: string | null | undefined, dir: SortDir): number {
  const r = (a ?? "").localeCompare(b ?? "");
  return dir === "asc" ? r : -r;
}

/**
 * Column-sort state. Clicking a new column sorts by that column in its natural "best first" direction
 * (given per column); clicking the same column again flips the direction.
 */
export function useSort<K extends string>(initial: SortState<K>, defaultDir: Partial<Record<K, SortDir>> = {}) {
  const [sort, setSort] = useState<SortState<K>>(initial);
  const toggle = useCallback((key: K) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: defaultDir[key] ?? "desc" }));
  }, [defaultDir]);
  const ariaSort = useCallback((key: K): "ascending" | "descending" | "none" => (sort.key !== key ? "none" : sort.dir === "asc" ? "ascending" : "descending"), [sort]);
  return useMemo(() => ({ sort, setSort, toggle, ariaSort }), [sort, toggle, ariaSort]);
}
