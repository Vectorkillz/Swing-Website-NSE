import type { Reasoning, Tone } from "../lib/reasoning";
import { IconInfo, IconTrendDown, IconTrendUp } from "./icons";

const TONE: Record<Tone, string> = { bull: "text-long bg-long/10", bear: "text-short bg-short/10", neutral: "text-muted bg-white/5", warn: "text-warn bg-warn/10" };

export default function ReasoningPanel({ r }: { r: Reasoning }) {
  return (
    <div className="card" data-testid="reasoning">
      <h3 className="mb-1 text-sm font-semibold">Summary</h3>
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
