import type { ReactNode } from "react";
import type { Band, CapBucket, MultibaggerLevel, Regime, Side } from "../lib/types";

export function Card({ title, children, className = "", right, hover = false }: { title?: ReactNode; children: ReactNode; className?: string; right?: ReactNode; hover?: boolean }) {
  return (
    <section className={`card ${hover ? "card-hover" : ""} ${className}`}>
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

export function Level({ label, value, tone = "", rule, big = false }: { label: string; value: ReactNode; tone?: string; rule?: string; big?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="label">{rule ? <span className="tip" data-tip={rule} tabIndex={0}>{label}</span> : label}</div>
      <div className={`mono ${big ? "text-xl md:text-2xl" : "text-base"} ${tone}`}>{value}</div>
    </div>
  );
}

export function Notice({ children, level = "warn" }: { children: ReactNode; level?: "warn" | "error" | "info" }) {
  const cls = level === "error" ? "bg-short/10 text-short" : level === "info" ? "bg-blue/10 text-blue" : "bg-warn/10 text-warn";
  return <div className={`rounded-xl px-3 py-2 text-sm ${cls}`} role={level === "error" ? "alert" : "status"}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-muted">{children}</div>;
}

export function Skeleton({ h = 80 }: { h?: number }) {
  return <div className="skeleton w-full" style={{ height: h }} aria-busy="true" />;
}

const REGIME_CLS: Record<Regime, string> = {
  BULL: "bg-long/20 text-long", BULL_HIGH_VIX: "bg-warn/20 text-warn", NEUTRAL: "bg-white/10 text-text", BEAR: "bg-short/20 text-short", UNKNOWN: "bg-white/5 text-muted",
};
export function RegimeBadge({ regime }: { regime: Regime }) {
  return <span className={`badge ${REGIME_CLS[regime]}`}>{regime.replace("_", " ")}</span>;
}

export function SideBadge({ side }: { side: Side }) {
  return <span className={`badge ${side === "long" ? "bg-long/20 text-long" : "bg-short/20 text-short"}`}>{side === "long" ? "LONG SETUP" : "SHORT SETUP"}</span>;
}

export function BandBadge({ band }: { band: Band }) {
  const cls = band === "A" ? "bg-long/20 text-long" : band === "B" ? "bg-blue/20 text-blue" : "bg-white/10 text-muted";
  return <span className={`badge ${cls}`} title="Ordinal band from raw score thresholds. A label, not a likelihood estimate.">Band {band}</span>;
}

export const CAP_LABEL: Record<CapBucket, string> = { large: "Large cap", mid: "Mid cap", small: "Small cap", micro: "Micro cap", unknown: "Cap unknown" };
export function CapBadge({ bucket }: { bucket: CapBucket }) {
  return <span className="badge bg-white/10 text-muted">{CAP_LABEL[bucket]}</span>;
}

export function MultibaggerBadge({ level, met, total }: { level: MultibaggerLevel; met?: number; total?: number }) {
  if (level === "none") return null;
  const cls = level === "strong" ? "bg-accent/25 text-long" : "bg-warn/20 text-warn";
  const title = "Heuristic trend-template tag: Stage 2, above SMA150, 30%+ off the 52-week low, within 25% of the 52-week high, relative strength > 0, not large cap. 'strong' also needs revenue or EPS growth. Not backtested.";
  return <span className={`badge ${cls}`} title={title}>✦ {level === "strong" ? "Multibagger: strong" : "Multibagger: watch"}{met != null && total != null ? ` ${met}/${total}` : ""}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const cls = status === "ok" ? "bg-long/20 text-long" : status === "failed" ? "bg-short/20 text-short" : status.includes("degraded") || status.includes("unavailable") || status === "partial" ? "bg-warn/20 text-warn" : "bg-white/10 text-muted";
  return <span className={`badge ${cls}`}>{status}</span>;
}
