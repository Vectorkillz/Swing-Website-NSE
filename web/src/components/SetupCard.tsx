import type { Candidate } from "../lib/types";
import { fmtInr, fmtPct } from "../lib/format";
import { CapBadge, FnoBadge, GradeBadge, Level, MultibaggerBadge, SideBadge } from "./ui";

export default function SetupCard({ cand, selected, onOpen, index = 0 }: { cand: Candidate; selected: boolean; onOpen: () => void; index?: number }) {
  const p = cand.plan;
  const long = cand.side === "long";
  return (
    <button
      type="button"
      onClick={onOpen}
      data-selected={selected}
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms`, borderLeft: `3px solid ${long ? "#00E676" : "#FF334B"}` }}
      className={`card card-hover fade-in w-full text-left focus:outline-none focus:ring-2 focus:ring-accent/60 ${selected ? "ring-2 ring-accent/60" : ""}`}
      aria-label={`${cand.symbol} ${cand.side} setup`}
      title="Open summary and technical reasoning"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold tracking-tight">{cand.symbol}</span>
            <SideBadge side={cand.side} />
            {cand.grade && <GradeBadge grade={cand.grade.grade} reasons={cand.grade.reasons} />}
            {cand.rank != null && <span className="badge bg-white/10 text-muted">#{cand.rank}</span>}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted">{cand.name ?? ""}{cand.sector ? ` · ${cand.sector}` : ""}</div>
        </div>
        <div className="text-right">
          <div className="mono text-lg font-semibold">{fmtInr(cand.close)}</div>
          <div className="text-[11px] text-muted">close {cand.last_bar_date}</div>
        </div>
      </div>

      {p ? (
        <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-bg/60 p-3">
          <Level label={long ? "Buy zone" : "Sell zone"} value={<>{fmtInr(p.entry)}{p.entry_max != null && <span className="text-xs text-muted"> – {fmtInr(p.entry_max)}</span>}</>} tone={long ? "text-long" : "text-short"} rule={long ? "Entry = close x (1 + 0.2%). Do not chase above the upper bound." : "Entry = close x (1 - 0.2%)."} />
          <Level label="Target" value={<>{fmtInr(p.target)}<span className="text-xs text-muted"> {p.reward_risk.toFixed(1)}R</span></>} tone="text-blue" rule={`${p.target_rule === "structure" ? (long ? "Momentum-leg high" : "Lowest low of the last 20 bars") : p.target_rule === "min_rr" ? "Structural level inside 1R; 2R used instead" : "No structural level beyond entry; 2R fallback"}. Extended target ${fmtInr(p.extended_target)} (${p.extended_target_r}R).`} />
          <Level label="Stop loss" value={<>{fmtInr(p.stop)}<span className="text-xs text-muted"> {fmtPct(p.stop_distance_pct, 1)}</span></>} tone="text-short" rule={`Tightest of ${Object.keys(p.stop_candidates).join(", ")}${p.floor_applied ? ", then floored to the minimum stop distance" : ""}.`} />
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-warn/10 p-3 text-xs text-warn">No price plan: {cand.warnings.join("; ") || "risk per share not positive"}</div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="mono font-semibold">{cand.score.raw.toFixed(0)} pts</span>
        <CapBadge bucket={cand.cap_bucket} />
        {cand.side === "long" && <FnoBadge eligible={cand.fno_eligible} />}
        {cand.multibagger && <MultibaggerBadge level={cand.multibagger.level} />}
        {cand.rs_vs_nifty != null && <span className={`badge ${cand.rs_vs_nifty >= 0 ? "bg-long/10 text-long" : "bg-white/5 text-muted"}`} title="Relative strength vs Nifty over 20 bars (percentage points)">RS {cand.rs_vs_nifty >= 0 ? "+" : ""}{cand.rs_vs_nifty.toFixed(1)}</span>}
        {cand.warnings.length > 0 && <span className="badge bg-warn/20 text-warn" title={cand.warnings.join("; ")}>⚠</span>}
      </div>
    </button>
  );
}
