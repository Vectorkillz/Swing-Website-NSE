import type { ScoreBreakdown } from "../lib/types";
import { fmtNum } from "../lib/format";
import { BandBadge } from "./ui";

export default function ScoreBars({ score }: { score: ScoreBreakdown }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-3">
        <span className="mono text-2xl" title="Raw rule score (sum of matched component points)">{score.raw.toFixed(0)}<span className="text-sm text-muted"> / {score.max_possible.toFixed(0)} pts</span></span>
        <span className="mono text-sm text-muted" title="raw / max_possible for this config version">norm {(score.normalised * 100).toFixed(0)}%</span>
        {score.display !== score.raw && <span className="text-xs text-muted" title="Display value clipped at 100 (clip_score_display_at_100). Raw is stored unclipped.">shown as {score.display.toFixed(0)}</span>}
        <BandBadge band={score.band} />
      </div>
      <ul className="space-y-1">
        {score.components.map((c) => (
          <li key={c.rule_id} className="grid grid-cols-[1fr_auto] items-center gap-2 text-xs sm:grid-cols-[10rem_1fr_auto]">
            <span className={`tip truncate ${c.matched ? "" : "text-muted"}`} data-tip={`Rule ${c.rule_id}${c.detail ? `: ${c.detail}` : ""}${c.value != null ? ` (value ${fmtNum(c.value, 2)} ${c.unit ?? ""})` : ""}`} tabIndex={0}>
              {c.label}
            </span>
            <span className="hidden h-2 overflow-hidden rounded bg-line sm:block" aria-hidden="true">
              <span className={`block h-full ${c.matched ? "bg-accent" : "bg-line"}`} style={{ width: c.max_points > 0 ? `${(c.points / c.max_points) * 100}%` : "0%" }} />
            </span>
            <span className="mono text-right">{c.points.toFixed(0)}<span className="text-muted">/{c.max_points.toFixed(0)}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
