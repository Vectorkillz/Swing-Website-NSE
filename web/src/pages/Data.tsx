import { useActiveConfigVersion, useConfigProfile, useConfigSchema, useJobs, useLatestRun, useRunIndex, useUniverseStatus } from "../lib/dataClient";
import { ageDays, fmtDateTime } from "../lib/format";
import { Card, Empty, Notice, RegimeBadge, Skeleton, StatusBadge } from "../components/ui";

const REPO = "https://github.com/Vectorkillz/Swing-Website-NSE";

export default function DataPage() {
  const { run } = useLatestRun();
  const index = useRunIndex();
  const jobs = useJobs();
  const uni = useUniverseStatus();
  const active = useActiveConfigVersion();
  const profile = useConfigProfile(active.data?.active);
  const schema = useConfigSchema();
  const uniAge = ageDays(uni.data?.as_of);

  return (
    <div className="space-y-5">
      <div className="fade-in">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Data &amp; refresh</h1>
        <p className="mt-1 text-sm text-muted">How the numbers get here, how fresh they are, and how to update them.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Latest scan">
          {run.data ? (
            <div className="space-y-1 text-sm">
              <div><RegimeBadge regime={run.data.regime.regime} /> <StatusBadge status={run.data.status} /></div>
              <div>Session {run.data.session_date}</div>
              <div className="text-xs text-muted">generated {fmtDateTime(run.data.generated_at)}</div>
              <div className="text-xs text-muted">coverage {run.data.coverage_pct}% · config {run.data.config_version}</div>
              {run.data.failures.length > 0 && <div className="text-xs text-warn">{run.data.failures.length} symbol fetch failures</div>}
            </div>
          ) : <Skeleton h={90} />}
        </Card>
        <Card title="Universe snapshot">
          {uni.data ? (
            <div className="space-y-1 text-sm">
              <div>{uni.data.n_symbols} F&amp;O symbols · source <b>{uni.data.source}</b></div>
              <div className="text-xs text-muted">as of {uni.data.as_of}{uniAge != null && uniAge > 7 && <span className="text-warn"> · {uniAge} days old</span>}</div>
              {uni.data.live_error && <div className="text-xs text-warn">last live fetch failed: {uni.data.live_error}</div>}
            </div>
          ) : uni.isError ? <Notice level="error">No universe snapshot committed.</Notice> : <Skeleton h={60} />}
        </Card>
        <Card title="Ban list">
          {run.data ? (
            run.data.ban_list.available ? <div className="text-sm">{run.data.ban_list.n} symbols in ban for trade date {run.data.ban_list.as_of} <span className="text-xs text-muted">({run.data.ban_list.source})</span></div> : <Notice>Unavailable for the latest run{run.data.ban_list.live_error ? `: ${run.data.ban_list.live_error}` : ""}.</Notice>
          ) : <Skeleton h={60} />}
        </Card>
      </div>

      <Card title="Refreshing the data">
        <ol className="space-y-3 text-sm">
          <li><b>Automatic.</b> A GitHub Actions job runs every trading day at 16:30 IST: it pulls the day's prices (yfinance), the F&amp;O ban list (NSE archive), runs the scan and republishes this site. Nothing to do.</li>
          <li><b>Run it now.</b> Open <a className="text-accent underline" href={`${REPO}/actions/workflows/scan.yml`} target="_blank" rel="noreferrer">Actions → Daily scan</a> → <i>Run workflow</i>. Leave the date blank for the latest session, or enter a past session date to rescan it. Takes 3–6 minutes, then this page updates.</li>
          <li><b>Upload your own market data.</b> Prices live as one CSV per symbol at <code>data/ohlcv/daily/SYMBOL.csv</code> with columns <code>date,open,high,low,close,volume</code>. On GitHub open that folder → <i>Add file → Upload files</i>, drop your CSVs (they replace the existing ones), commit, then run <i>Daily scan</i> with <i>skip ingest</i> ticked so your files are used as-is.</li>
          <li><b>Update the stock list.</b> <a className="text-accent underline" href={`${REPO}/actions/workflows/refresh_universe.yml`} target="_blank" rel="noreferrer">Actions → Refresh universe</a> pulls the current NSE F&amp;O list with lot sizes. To hand-edit it, change <code>data/universe/fno_universe.csv</code>.</li>
          <li><b>Fundamentals</b> (market cap, growth, ROE) refresh weekly on Saturdays via <i>Refresh fundamentals</i>; run it manually any time.</li>
          <li><b>Holidays.</b> Keep <code>data/calendar/nse_holidays_2026.csv</code> current so the scheduler skips market holidays.</li>
        </ol>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Recent jobs">
          {jobs.data ? (
            <table className="data"><tbody>
              {jobs.data.jobs.slice(0, 12).map((j, i) => <tr key={i}><td>{j.job}</td><td className="text-xs text-muted">{fmtDateTime(j.started_at)}</td><td><StatusBadge status={j.status} /></td><td className="mono text-right text-xs">{j.n_errors ? `${j.n_errors} err` : ""}</td></tr>)}
            </tbody></table>
          ) : jobs.isError ? <Empty>No job log yet.</Empty> : <Skeleton h={120} />}
        </Card>
        <Card title="Scan runs">
          {index.data ? (
            <table className="data"><tbody>
              {index.data.runs.slice(0, 12).map((r) => <tr key={r.run_id}><td><a className="text-accent" href={`#/run/${r.run_id}`}>{r.session_date}</a></td><td><RegimeBadge regime={r.regime} /></td><td><StatusBadge status={r.status} /></td><td className="mono text-right text-xs">{r.n_longs}L / {r.n_shorts}S</td></tr>)}
            </tbody></table>
          ) : <Skeleton h={120} />}
        </Card>
      </div>

      <Card title={`Scanner rules (config ${active.data?.active ?? ""})`}>
        <p className="mb-3 text-xs text-muted">Every threshold is versioned data in <code>config/profiles/</code>. To change one, copy the active file to a new version, edit it, point <code>config/active.json</code> at it and run the scan. Runs record the version they used.</p>
        {profile.data && schema.data ? (
          <div className="grid gap-x-6 gap-y-1 text-xs md:grid-cols-2">
            {Object.entries(profile.data.values).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 py-1" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                <span className="tip text-muted" data-tip={schema.data!.properties[k]?.description ?? ""} tabIndex={0}>{k}</span>
                <span className="mono">{String(v)} <span className="text-muted">{schema.data!.properties[k]?.["x-unit"]}</span></span>
              </div>
            ))}
          </div>
        ) : <Skeleton h={200} />}
      </Card>
    </div>
  );
}
