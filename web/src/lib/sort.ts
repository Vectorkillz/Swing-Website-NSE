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
export function cmpBool(a: boolean | null | undefined, b: boolean | null | undefined, dir: SortDir): number {
  return cmpNum(a == null ? null : a ? 1 : 0, b == null ? null : b ? 1 : 0, dir);
}

/** Chain comparators: first non-zero wins. */
export function chain<T>(...cmps: ((a: T, b: T) => number)[]): (a: T, b: T) => number {
  return (a, b) => { for (const c of cmps) { const r = c(a, b); if (r !== 0) return r; } return 0; };
}

/**
 * Multi-column sort state. A plain click on a column makes it the only sort key (in that column's
 * natural "best first" direction); clicking the same column again flips it. A shift-click adds the
 * column as a secondary key (or flips it if already present), so "Change % then Volume" is two clicks.
 */
export function useSort<K extends string>(initial: SortState<K>, defaultDir: Partial<Record<K, SortDir>> = {}) {
  const [sorts, setSorts] = useState<SortState<K>[]>([initial]);
  const toggle = useCallback((key: K, additive = false) => {
    setSorts((cur) => {
      const i = cur.findIndex((s) => s.key === key);
      const flipped = (s: SortState<K>): SortState<K> => ({ key, dir: s.dir === "asc" ? "desc" : "asc" });
      const fresh: SortState<K> = { key, dir: defaultDir[key] ?? "desc" };
      if (!additive) return i === 0 ? [flipped(cur[0]), ...cur.slice(1)] : i > 0 ? [flipped(cur[i]), ...cur.filter((_, j) => j !== i)] : [fresh];
      if (i >= 0) return cur.map((s, j) => (j === i ? flipped(s) : s));
      return [...cur, fresh];
    });
  }, [defaultDir]);
  const ariaSort = useCallback((key: K): "ascending" | "descending" | "none" => {
    const s = sorts.find((x) => x.key === key);
    return !s ? "none" : s.dir === "asc" ? "ascending" : "descending";
  }, [sorts]);
  const rank = useCallback((key: K) => sorts.findIndex((s) => s.key === key) + 1, [sorts]);
  const sort = sorts[0];
  const setSort = useCallback((s: SortState<K>) => setSorts([s]), []);
  return useMemo(() => ({ sort, sorts, setSort, toggle, ariaSort, rank }), [sort, sorts, setSort, toggle, ariaSort, rank]);
}
export type Sorter<K extends string> = ReturnType<typeof useSort<K>>;
