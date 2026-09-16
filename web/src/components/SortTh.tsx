import type { ReactNode } from "react";
import { IconSort } from "./icons";

export default function SortTh<K extends string>({ k, label, ariaSort, onToggle, rank, right = false, className = "", title }: { k: K; label: ReactNode; ariaSort: (k: K) => "ascending" | "descending" | "none"; onToggle: (k: K, additive: boolean) => void; rank?: (k: K) => number; right?: boolean; className?: string; title?: string }) {
  const s = ariaSort(k);
  const next = s === "descending" ? "lowest to highest" : "highest to lowest";
  const r = rank ? rank(k) : 0;
  return (
    <th className={`sortable ${right ? "text-right" : ""} ${className}`} aria-sort={s} scope="col">
      <button type="button" onClick={(e) => onToggle(k, e.shiftKey)} title={`${title ? title + " · " : ""}Sort ${next}. Shift-click to add as a secondary sort.`}>
        {label}
        <IconSort size={12} />
        {r > 1 && <span className="rounded bg-ink/10 px-1 text-[9px] leading-3">{r}</span>}
      </button>
    </th>
  );
}
