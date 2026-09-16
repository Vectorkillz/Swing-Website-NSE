import type { ReactNode } from "react";
import { IconSort } from "./icons";

export default function SortTh<K extends string>({ k, label, ariaSort, onToggle, right = false, className = "" }: { k: K; label: ReactNode; ariaSort: (k: K) => "ascending" | "descending" | "none"; onToggle: (k: K) => void; right?: boolean; className?: string }) {
  const s = ariaSort(k);
  const next = s === "descending" ? "lowest to highest" : "highest to lowest";
  return (
    <th className={`sortable ${right ? "text-right" : ""} ${className}`} aria-sort={s} scope="col">
      <button type="button" onClick={() => onToggle(k)} title={`Sort ${next}`}>
        {label}
        <IconSort size={12} />
      </button>
    </th>
  );
}
