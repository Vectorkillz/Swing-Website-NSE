import { useJobs, useSymbolStatus, useUniverseStatus } from "../lib/dataClient";
import { useLatestRun } from "../lib/useLatestRun";
import { ageDays, fmtDateTime } from "../lib/format";
import { Card, Empty, Loading, StatusBadge, Warn } from "../components/ui";

export default function Admin() {
  const { runId, run } = useLatestRun();
  const status = useSymbolStatus(runId);
  const jobs = useJobs();
  const universe = useUniverseStatus();
  const uniAge = ageDays(universe.data?.as_of);

  const byOutcome = new Map<string, { symbol: string; reasons: string[] }[]>();
  for (const s of status.data?.statuses ?? []) byOutcome.set(s.outcome, [...(byOutcome.get(s.outcome) ?? []), s]);

  return (
    <div className="space-y-4">
      <Card title="Universe snapshot">
        {universe.isError ? <Warn level="error">No universe snapshot committed. Add data/universe/fno_universe.csv (columns: symbol,name,sector,industry,isin,lot_size) and data/universe/status.json, or run the "Refresh universe" workflow.</Warn> : universe.data ? (
          <div className="space-y-1 text-sm">
            <div>{universe.data.n_symbols} symbols · source <b>{universe.data.source}</b> · as of {universe.data.as_of}{uniAge != null && uniAge > 7 && <span className="text-warn"> · {uniAge} days old (stale)</span>}</div>
            {universe.data.live_error && <div className="text-xs text-warn">Last live fetch failed: {universe.data.live_error}</div>}
            <div className="text-xs text-muted">To upload manually: commit a CSV to data/universe/fno_universe.csv and set as_of in status.json. Never edit a hardcoded list in source.</div>
          </div>
        ) : <Loading what="universe status" />}
      </Card>

      <Card title="Data source health (latest run)">
        {run.data ? (
          <div className="space-y-1 text-sm">
            <div>Run {run.data.run_id} · <StatusBadge status={run.data.status} /> · coverage {run.data.coverage_pct}%</div>
            <div>Ban list: {run.data.ban_list.available ? `available (${run.data.ban_list.source}, trade date ${run.data.ban_list.as_of}, ${run.data.ban_list.n} symbols)` : <span className="text-warn">unavailable{run.data.ban_list.live_error ? ` — ${run.data.ban_list.live_error}` : ""}</span>}</div>
            <div>Smallcap 100 index: {run.data.regime.smallcap_close == null ? <span className="text-warn">unavailable from provider</span> : "ok"}</div>
            <div>VIX: {run.data.regime.vix == null ? <span className="text-short">missing (regime UNKNOWN)</span> : "ok"}</div>
            {run.data.failures.length > 0 && (
              <details><summary className="cursor-pointer text-warn">{run.data.failures.length} fetch failures</summary>
                <table className="data mt-2"><tbody>{run.data.failures.map((f, i) => <tr key={i}><td className="mono">{f.symbol}</td><td>{f.stage}</td><td className="text-xs">{f.error}</td></tr>)}</tbody></table>
              </details>
            )}
          </div>
        ) : <Loading what="run" />}
      </Card>

      <Card title="Symbol outcomes (latest run)">
        {status.data ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[...byOutcome.entries()].sort((x, y) => y[1].length - x[1].length).map(([outcome, rows]) => (
              <details key={outcome} className="rounded border border-line p-2">
                <summary className="cursor-pointer text-sm"><span className="mono">{rows.length}</span> · {outcome}</summary>
                <ul className="mt-2 max-h-64 overflow-auto text-xs">{rows.map((r) => <li key={r.symbol}><span className="mono">{r.symbol}</span> <span className="text-muted">{r.reasons.join("; ")}</span></li>)}</ul>
              </details>
            ))}
          </div>
        ) : <Loading what="symbol status" />}
      </Card>

      <Card title="Jobs">
        {jobs.isError ? <Empty>No job log yet.</Empty> : jobs.data ? (
          <div className="overflow-x-auto">
            <table className="data">
              <thead><tr><th>Job</th><th>Started</th><th className="text-right">Duration</th><th>Status</th><th className="text-right">Errors</th><th>Counters</th></tr></thead>
              <tbody>
                {jobs.data.jobs.map((j, i) => (
                  <tr key={i}><td>{j.job}</td><td className="text-xs">{fmtDateTime(j.started_at)}</td><td className="mono text-right">{j.duration_s}s</td><td><StatusBadge status={j.status} /></td><td className="mono text-right">{j.n_errors}</td><td className="text-xs text-muted">{Object.entries(j.counters).filter(([k]) => k !== "warnings").map(([k, v]) => `${k}=${String(v)}`).join(" ")}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Loading what="jobs" />}
      </Card>
    </div>
  );
}
