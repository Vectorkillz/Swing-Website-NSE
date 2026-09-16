import type { Reasoning, Tone } from "../lib/reasoning";
import { IconInfo, IconTrendDown, IconTrendUp } from "./icons";

const TONE: Record<Tone, string> = { bull: "text-long bg-long/10", bear: "text-short bg-short/10", neutral: "text-muted bg-ink/5", warn: "text-warn bg-warn/10" };

/** Count of bullish vs bearish reasoning points. A tally of stored facts, not a forecast. */
export function technicalBias(r: Reasoning): { bull: number; bear: number; label: string; tone: Tone } {
  const bull = r.points.filter((p) => p.tone === "bull").length;
  const bear = r.points.filter((p) => p.tone === "bear").length;
  const label = bull > bear ? "Bullish lean" : bear > bull ? "Bearish lean" : "Mixed";
  return { bull, bear, label, tone: bull > bear ? "bull" : bear > bull ? "bear" : "neutral" };
}

export function BiasBadge({ r }: { r: Reasoning }) {
  const b = technicalBias(r);
  return (
    <span className={`badge ${TONE[b.tone]}`} title="Count of bullish vs bearish technical points below. A tally, not a forecast." data-testid="bias">
      {b.tone === "bull" ? <IconTrendUp size={12} /> : b.tone === "bear" ? <IconTrendDown size={12} /> : <IconInfo size={12} />}
      <span className="ml-1">{b.label} · {b.bull}↑ {b.bear}↓</span>
    </span>
  );
}

export default function ReasoningPanel({ r }: { r: Reasoning }) {
  return (
    <div className="card" data-testid="reasoning">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Summary</h3>
        <BiasBadge r={r} />
      </div>
      <p className="text-sm leading-relaxed text-text/90">{r.summary}</p>
      <h3 className="mb-2 mt-4 text-sm font-semibold">Technical reasoning</h3>
      <ul className="grid gap-2 sm:grid-cols-2">
        {r.points.map((p, i) => (
          <li key={i} className="flex gap-2 rounded-xl bg-bg/50 p-2.5 fade-in" style={{ animationDelay: `${i * 30}ms` }}>
            <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${TONE[p.tone]}`}>
              {p.tone === "bull" ? <IconTrendUp size={14} /> : p.tone === "bear" ? <IconTrendDown size={14} /> : <IconInfo size={14} />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{p.title}</span>
              {p.detail && <span className="block text-xs leading-relaxed text-muted">{p.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
