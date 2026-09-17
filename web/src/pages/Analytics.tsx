import { useMemo } from "react";
import { useCandidates, useLatestRun, useRunIndex, useRuns, useUniverse } from "../lib/dataClient";
import { fmtNum } from "../lib/format";
import { computeMood, ZONE_LABEL } from "../lib/mood";
import type { Grade } from "../lib/types";
import { C, Columns, HBars, Histogram, LineChart, Split } from "../components/charts";
import MoodMeter from "../components/MoodMeter";
import RefreshButton from "../components/RefreshButton";
import { Card, Empty, Notice, RegimeBadge, Skeleton } from "../components/ui";

const GRADES: Grade[] = ["A++", "A+", "A", "B+", "B"];

function Kpi({ label, value, sub, tone = "" }: { label: string; value: string; sub?: string; tone?: string }) {
  return <div className="tile tile-kpi col-span-1 md:col-span-3"><div className="label">{label}</div><div className={`kpi ${tone}`}>{value}</div>{sub && <div className="mt-1 text-[11px] text-muted">{sub}</div>}</div>;
}

export default function Analytics() {
  const { runId, run } = useLatestRun();
  const index = useRunIndex();
  const uni = useUniverse(runId);
  const cands = useCandidates(runId);
  const runIds = useMemo(() => (index.data?.runs ?? []).map((r) => r.run_id), [index.data]);
  const runs = useRuns(runIds);

  const mood = useMemo(() => (run.data ? computeMood(run.data) : null), [run.data]);
  const history = useMemo(() => {
    const pts: { x: string; y: number; label?: string }[] = [];
    runs.forEach((q) => { const m = q.data ? computeMood(q.data) : null; if (m && q.data) pts.push({ x: q.data.session_date, y: m.score, label: `${ZONE_LABEL[m.zone]} · ${q.data.regime.regime}${m.complete ? "" : " (trend + VIX only)"}` }); });
    return pts.sort((a, b) => a.x.localeCompare(b.x));
  }, [runs]);

  const rows = uni.data?.rows ?? [];
  const sectors = useMemo(() => {
    const by = new Map<string, number[]>();
    for (const r of rows) if (r.rs_vs_nifty != null && r.swing_suitable) { const k = r.sector ?? "Unknown"; (by.get(k) ?? by.set(k, []).get(k)!).push(r.rs_vs_nifty); }
    const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
    return Array.from(by.entries()).filter(([, v]) => v.length >= 5).map(([label, v]) => ({ label, value: med(v), sub: `${v.length} stocks` })).sort((a, b) => b.value - a.value);
  }, [rows]);
  const rsis = useMemo(() => rows.map((r) => r.context?.rsi14).filter((x): x is number => x != null), [rows]);
  const all = cands.data?.candidates ?? [];
  const gradeGroups = useMemo(() => GRADES.map((g) => ({ x: g, values: [all.filter((c) => c.side === "long" && c.grade?.grade === g).length, all.filter((c) => c.side === "short" && c.grade?.grade === g).length] })), [all]);
  const setupHistory = useMemo(() => [...(index.data?.runs ?? [])].sort((a, b) => a.session_date.localeCompare(b.session_date)).slice(-12).map((r) => ({ x: r.session_date, values: [r.n_longs, r.n_shorts] })), [index.data]);

  if (!run.data) return <div className="space-y-3"><Skeleton h={60} /><Skeleton h={260} /><div className="bento"><Skeleton h={100} /><Skeleton h={100} /><Skeleton h={100} /><Skeleton h={100} /></div></div>;
  const r = run.data, c = r.counts, n = c.breadth_n ?? 0;
  const pct = (k: string) => (n ? (100 * (c[k] ?? 0)) / n : null);
  const fp = (x: number | null) => (x == null ? "—" : `${x.toFixed(0)}%`);

  return (
    <div className="space-y-5">
      <section className="fade-in flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">Analytics</h1><p className="mt-1 text-sm text-muted">Market mood, breadth, sector strength and setup mix for session {r.session_date} · <RegimeBadge regime={r.regime.regime} /></p></div>
        <RefreshButton />
      </section>

      {mood ? <MoodMeter mood={mood} /> : <Notice>Mood cannot be computed: this run has no Nifty or VIX reading.</Notice>}

      {n === 0 && <Notice>Breadth aggregates were added on 17 Sep 2026; this run predates them. Run <b>Daily scan</b> once to populate the breadth tiles.</Notice>}
      <section className="bento">
        <Kpi label="Above 200-day EMA" value={fp(pct("breadth_above_ema200"))} sub={`${fmtNum(c.breadth_above_ema200)} of ${fmtNum(n)} stocks`} tone={(pct("breadth_above_ema200") ?? 50) >= 50 ? "text-long" : "text-short"} />
        <Kpi label="Above 50-day EMA" value={fp(pct("breadth_above_ema50"))} sub={`${fmtNum(c.breadth_above_ema50)} stocks`} tone={(pct("breadth_above_ema50") ?? 50) >= 50 ? "text-long" : "text-short"} />
        <Kpi label="Up over 20 sessions" value={fp(pct("breadth_roc20_positive"))} sub={`median 20-bar change ${c.breadth_median_roc20 != null ? `${c.breadth_median_roc20 >= 0 ? "+" : ""}${c.breadth_median_roc20.toFixed(1)}%` : "—"}`} />
        <Kpi label="Volume surges" value={fmtNum(c.breadth_vol_surge)} sub="stocks at 2× or more of 20-day average volume" />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Trend structure">
          {n ? (
            <div className="space-y-4 text-sm">
              <Split a={c.breadth_stage2 ?? 0} b={c.breadth_stage4 ?? 0} labelA="Stage 2 uptrend" labelB="Stage 4 downtrend" />
              <Split a={c.breadth_near_52w_high ?? 0} b={c.breadth_near_52w_low ?? 0} labelA="Within 5% of 52w high" labelB="Within 5% of 52w low" />
              <Split a={c.breadth_rs_positive ?? 0} b={n - (c.breadth_rs_positive ?? 0)} labelA="Outperforming Nifty (20 bars)" labelB="Underperforming" />
              <div className="text-xs text-muted">{fmtNum(c.breadth_hh_hl)} stocks ({fp(pct("breadth_hh_hl"))}) made a higher high and higher low over the last 20 sessions vs the 20 before.</div>
            </div>
          ) : <Empty>No breadth data for this run.</Empty>}
        </Card>
        <Card title="RSI(14) distribution" right={<span className="text-xs text-muted">median {c.breadth_median_rsi14?.toFixed(0) ?? "—"}</span>}>
          {rsis.length ? <Histogram values={rsis} bins={20} min={0} max={100} marks={[30, 50, 70]} /> : uni.isLoading ? <Skeleton h={120} /> : <Empty>No RSI values in this run.</Empty>}
          <p className="mt-2 text-[11px] text-muted">Count of scanned stocks per RSI bucket. Lines at 30, 50 and 70.</p>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Sector strength" right={<span className="text-xs text-muted">median RS vs Nifty, swing-tradable stocks</span>}>
          {sectors.length ? (
            <>
              <HBars rows={sectors} unit=" pp" diverging />
              <details className="mt-3 text-xs"><summary className="cursor-pointer text-muted hover:text-text">Table</summary><table className="data mt-2"><tbody>{sectors.map((s) => <tr key={s.label}><td>{s.label}</td><td className="mono text-right">{s.value >= 0 ? "+" : ""}{s.value.toFixed(1)} pp</td><td className="text-right text-muted">{s.sub}</td></tr>)}</tbody></table></details>
            </>
          ) : uni.isLoading ? <Skeleton h={200} /> : <Empty>Not enough sector data.</Empty>}
        </Card>
        <div className="space-y-4">
          <Card title="Setups by grade" right={<span className="text-xs text-muted">{all.length} matched this session</span>}>
            {all.length ? <Columns groups={gradeGroups} series={["Long", "Short"]} colors={[C.up, C.down]} /> : <Empty>No setups this session.</Empty>}
          </Card>
          <Card title="Ranked setups per session">
            {setupHistory.length ? <Columns groups={setupHistory} series={["Long", "Short"]} colors={[C.up, C.down]} /> : <Skeleton h={120} />}
          </Card>
        </div>
      </div>

      <Card title="Mood over sessions" right={<span className="text-xs text-muted">{history.length} sessions</span>}>
        {history.length >= 2 ? <LineChart points={history} bands={[30, 50, 70]} /> : history.length === 1 ? <p className="text-sm text-muted">Only one session has a mood reading so far ({history[0].x}: {history[0].y.toFixed(0)}). The line fills in as daily scans accumulate.</p> : <Skeleton h={140} />}
        <details className="mt-3 text-xs"><summary className="cursor-pointer text-muted hover:text-text">Table</summary><table className="data mt-2"><tbody>{history.map((p) => <tr key={p.x}><td>{p.x}</td><td className="mono text-right">{p.y.toFixed(0)}</td><td className="text-muted">{p.label}</td></tr>)}</tbody></table></details>
      </Card>

      <p className="text-[11px] text-muted">All figures are counts and medians over the stocks the scanner could read for the session. Sector strength uses swing-tradable stocks only and hides sectors with fewer than five. Nothing on this page forecasts price movement.</p>
    </div>
  );
}
