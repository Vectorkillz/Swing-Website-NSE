import type { ScoreBreakdown } from "../lib/types";
import { fmtNum } from "../lib/format";
import { BandBadge } from "./ui";

export default function ScoreBars({ score }: { score: ScoreBreakdown }) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <span className="mono text-2xl font-semibold" title="Raw rule score">{score.raw.toFixed(0)}<span className="text-sm font-normal text-muted"> / {score.max_possible.toFixed(0)} pts</span></span>
        <BandBadge band={score.band} />
      </div>
      <ul className="space-y-1.5">
        {score.components.map((c) => (
          <li key={c.rule_id} className="grid grid-cols-[1fr_auto] items-center gap-2 text-xs sm:grid-cols-[9rem_1fr_auto]">
            <span className={`tip truncate ${c.matched ? "" : "text-muted"}`} data-tip={`Rule ${c.rule_id}${c.detail ? `: ${c.detail}` : ""}${c.value != null ? ` (value ${fmtNum(c.value, 2)} ${c.unit ?? ""})` : ""}`} tabIndex={0}>{c.label}</span>
            <span className="hidden h-1.5 overflow-hidden rounded-full bg-white/5 sm:block" aria-hidden="true">
              <span className={`block h-full rounded-full transition-all ${c.matched ? "bg-accent" : "bg-transparent"}`} style={{ width: c.max_points > 0 ? `${(c.points / c.max_points) * 100}%` : "0%" }} />
            </span>
            <span className="mono text-right">{c.points.toFixed(0)}<span className="text-muted">/{c.max_points.toFixed(0)}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
