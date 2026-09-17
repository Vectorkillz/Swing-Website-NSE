import { Link } from "react-router-dom";
import { ZONE_LABEL, type MoodResult } from "../lib/mood";
import { C, Gauge, Meter } from "./charts";

const ZONE_CLS = { extreme_fear: "bg-short/25 text-short", fear: "bg-short/10 text-short", greed: "bg-long/10 text-long", extreme_greed: "bg-long/25 text-long" } as const;

export function MoodChip({ mood }: { mood: MoodResult | null }) {
  if (!mood) return null;
  return <Link to="/analytics" className={`badge ${ZONE_CLS[mood.zone]} hover:brightness-110`} title="Market mood, computed from Nifty trend, VIX and breadth. Open Analytics for the breakdown." data-testid="mood-chip">Mood {mood.score.toFixed(0)} · {ZONE_LABEL[mood.zone]}</Link>;
}

export default function MoodMeter({ mood }: { mood: MoodResult }) {
  return (
    <div className="card" data-testid="mood-meter">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="text-sm font-semibold">Market mood</h2><p className="text-xs text-muted">Session {mood.session} · 0 = extreme fear, 100 = extreme greed</p></div>
        <span className={`badge ${ZONE_CLS[mood.zone]}`}>{ZONE_LABEL[mood.zone]}</span>
      </div>
      <div className="grid gap-4 md:grid-cols-[260px_1fr] md:items-center">
        <div className="mx-auto w-full max-w-[260px]"><Gauge value={mood.score} label="Market mood" /><div className="-mt-1 flex justify-between text-[10px] text-muted"><span>Extreme fear</span><span>Fear</span><span>Greed</span><span>Extreme greed</span></div></div>
        <ul className="space-y-2.5">
          {mood.components.map((c) => (
            <li key={c.key} className="text-xs">
              <div className="flex items-baseline justify-between gap-2"><span className="tip" data-tip={c.how} tabIndex={0}>{c.label}</span><span className="text-muted">{c.raw} · <b className="mono text-text">{c.value.toFixed(0)}</b></span></div>
              <div className="mt-1"><Meter value={c.value} color={c.value >= 50 ? C.up : C.down} /></div>
            </li>
          ))}
        </ul>
      </div>
      {!mood.complete && <p className="mt-2 text-[11px] text-warn">Breadth components are missing for this session (scanned before they were recorded); the score uses trend and VIX only.</p>}
      <p className="mt-3 text-[11px] text-muted">Equal-weight average of the components. Built from this site's own end-of-day data: Nifty vs its 20-day EMA, India VIX, and breadth across the scanned universe. It is not Tickertape's MMI and shares none of its inputs; the zone names follow the same convention. Describes the current tape; it forecasts nothing.</p>
    </div>
  );
}
