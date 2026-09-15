import { useState } from "react";
import { Link } from "react-router-dom";
import { useCandidates, useRun, useRunIndex } from "../lib/dataClient";
import { fmtDateTime, fmtPct } from "../lib/format";
import { Card, Empty, Loading, RegimeBadge, StatusBadge, Warn } from "../components/ui";

function Compare({ a, b }: { a: string; b: string }) {
  const ra = useRun(a), rb = useRun(b);
  const ca = useCandidates(a), cb = useCandidates(b);
  if (!ra.data || !rb.data || !ca.data || !cb.data) return <Loading what="runs" />;
  const key = (c: { symbol: string; side: string }) => `${c.symbol}:${c.side}`;
  const ma = new Map(ca.data.candidates.map((c) => [key(c), c]));
  const mb = new Map(cb.data.candidates.map((c) => [key(c), c]));
  const added = [...mb.keys()].filter((k) => !ma.has(k));
  const removed = [...ma.keys()].filter((k) => !mb.has(k));
  const common = [...ma.keys()].filter((k) => mb.has(k));
  const countKeys = Array.from(new Set([...Object.keys(ra.data.counts), ...Object.keys(rb.data.counts)]));
  return (
    <div className="space-y-3">
      <table className="data">
        <thead><tr><th></th><th>{a}</th><th>{b}</th></tr></thead>
        <tbody>
          <tr><td>Regime</td><td><RegimeBadge regime={ra.data.regime.regime} /></td><td><RegimeBadge regime={rb.data.regime.regime} /></td></tr>
          <tr><td>Config</td><td className="mono">{ra.data.config_version}</td><td className="mono">{rb.data.config_version}{rb.data.config_version !== ra.data.config_version && <span className="ml-1 text-warn">changed</span>}</td></tr>
          <tr><td>Status</td><td><StatusBadge status={ra.data.status} /></td><td><StatusBadge status={rb.data.status} /></td></tr>
          <tr><td>VIX</td><td className="mono">{ra.data.regime.vix}</td><td className="mono">{rb.data.regime.vix}</td></tr>
          {countKeys.map((k) => <tr key={k}><td>{k}</td><td className="mono">{ra.data!.counts[k] ?? "—"}</td><td className={`mono ${ra.data!.counts[k] !== rb.data!.counts[k] ? "text-warn" : ""}`}>{rb.data!.counts[k] ?? "—"}</td></tr>)}
        </tbody>
      </table>
      <div className="grid gap-3 md:grid-cols-3 text-sm">
        <Card title={`Added in ${b} (${added.length})`}>{added.length ? added.map((k) => <div key={k} className="mono">{k}</div>) : <Empty>none</Empty>}</Card>
        <Card title={`Dropped from ${a} (${removed.length})`}>{removed.length ? removed.map((k) => <div key={k} className="mono">{k}</div>) : <Empty>none</Empty>}</Card>
        <Card title={`Score changes (${common.length} common)`}>
          {common.length ? common.map((k) => { const d = mb.get(k)!.score.raw - ma.get(k)!.score.raw; return <div key={k} className="mono flex justify-between"><span>{k}</span><span className={d > 0 ? "text-long" : d < 0 ? "text-short" : "text-muted"}>{d >= 0 ? "+" : ""}{d.toFixed(0)} pts</span></div>; }) : <Empty>none</Empty>}
        </Card>
      </div>
    </div>
  );
}

export default function Runs() {
  const index = useRunIndex();
  const [a, setA] = useState<string>("");
  const [b, setB] = useState<string>("");
  if (index.isError) return <Empty>No runs published yet.</Empty>;
  if (!index.data) return <Loading what="runs" />;
  const runs = index.data.runs;
  return (
    <div className="space-y-4">
      <Warn level="info">Re-running with a different config is done by committing a new profile version and dispatching the "Daily scan" workflow in GitHub Actions (workflow_dispatch with a session date). Each run records the config version and input hash it used.</Warn>
      <Card title={`Runs (${runs.length})`}>
        <div className="overflow-x-auto">
          <table className="data">
            <thead><tr><th>Run</th><th>Session</th><th>Generated</th><th>Regime</th><th>Status</th><th>Config</th><th className="text-right">Longs</th><th className="text-right">Shorts</th><th className="text-right">Coverage</th><th></th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.run_id}>
                  <td className="mono text-xs"><Link className="text-accent" to={`/candidates/${r.run_id}`}>{r.run_id}</Link></td>
                  <td>{r.session_date}</td>
                  <td className="text-xs">{fmtDateTime(r.generated_at)}</td>
                  <td><RegimeBadge regime={r.regime} /></td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="mono">{r.config_version}</td>
                  <td className="mono text-right">{r.n_longs}</td>
                  <td className="mono text-right">{r.n_shorts}</td>
                  <td className="mono text-right">{fmtPct(r.coverage_pct)}</td>
                  <td className="text-xs"><button className="btn text-xs" onClick={() => setA(r.run_id)}>A</button> <button className="btn text-xs" onClick={() => setB(r.run_id)}>B</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Compare two runs">
        {a && b ? <Compare a={a} b={b} /> : <Empty>Pick run A and run B above.</Empty>}
      </Card>
    </div>
  );
}
