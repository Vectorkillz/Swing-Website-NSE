import type { ReactNode } from "react";
import type { Band, Regime, RankStatus, Side } from "../lib/types";

export function Card({ title, children, className = "", right }: { title?: ReactNode; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

/** A value with its unit and a tooltip naming the rule that produced it. */
export function Stat({ label, value, unit, rule }: { label: string; value: ReactNode; unit?: string; rule?: string }) {
  return (
    <div className="min-w-[7rem]">
      <div className="label">{label}</div>
      <div className="mono text-base">
        {rule ? <span className="tip" data-tip={rule} tabIndex={0}>{value}</span> : value}
        {unit && <span className="ml-1 text-xs text-muted">{unit}</span>}
      </div>
    </div>
  );
}

export function Warn({ children, level = "warn" }: { children: ReactNode; level?: "warn" | "error" | "info" }) {
  const cls = level === "error" ? "border-short/60 bg-short/10" : level === "info" ? "border-accent/60 bg-accent/10" : "border-warn/60 bg-warn/10";
  return <div className={`rounded-md border px-3 py-2 text-sm ${cls}`} role={level === "error" ? "alert" : "status"}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-line p-6 text-center text-sm text-muted">{children}</div>;
}

export function Loading({ what }: { what: string }) {
  return <div className="text-sm text-muted" aria-busy="true">Loading {what}…</div>;
}

const REGIME_CLS: Record<Regime, string> = {
  BULL: "bg-long/20 text-long",
  BULL_HIGH_VIX: "bg-warn/20 text-warn",
  NEUTRAL: "bg-muted/20 text-text",
  BEAR: "bg-short/20 text-short",
  UNKNOWN: "bg-line text-muted",
};

export function RegimeBadge({ regime }: { regime: Regime }) {
  return <span className={`badge ${REGIME_CLS[regime]}`}>{regime.replace("_", " ")}</span>;
}

export function SideBadge({ side }: { side: Side }) {
  return <span className={`badge ${side === "long" ? "bg-long/20 text-long" : "bg-short/20 text-short"}`}>{side.toUpperCase()}</span>;
}

export function BandBadge({ band }: { band: Band }) {
  const cls = band === "A" ? "bg-long/20 text-long" : band === "B" ? "bg-accent/20 text-accent" : "bg-muted/20 text-muted";
  return <span className={`badge ${cls}`} title="Ordinal band from raw score thresholds (band_a_min / band_b_min). An ordinal label, not a likelihood estimate.">Band {band}</span>;
}

export function RankBadge({ status, reason }: { status: RankStatus | null; reason: string | null }) {
  if (!status) return <span className="badge bg-line text-muted" title={reason ?? undefined}>unranked</span>;
  if (status === "ranked") return <span className="badge bg-long/20 text-long">ranked</span>;
  const cls = status === "not_in_top_n" ? "bg-line text-muted" : "bg-warn/20 text-warn";
  return <span className={`badge ${cls}`} title={reason ?? undefined}>{status.replace(/_/g, " ")}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const cls = status === "ok" ? "bg-long/20 text-long" : status.startsWith("degraded") || status.includes("unavailable") || status === "partial" ? "bg-warn/20 text-warn" : status === "failed" ? "bg-short/20 text-short" : "bg-line text-muted";
  return <span className={`badge ${cls}`}>{status}</span>;
}
