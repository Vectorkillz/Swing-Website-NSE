import { Link } from "react-router-dom";
import { useCandidates, useConfigProfile, useJobs } from "../lib/dataClient";
import { useLatestRun } from "../lib/useLatestRun";
import { useLocalConstraints } from "../lib/useLocalConstraints";
import { fmtInr, fmtPct } from "../lib/format";
import RegimeBanner from "../components/RegimeBanner";
import { Card, Empty, Loading, RankBadge, SideBadge, Stat, StatusBadge, Warn } from "../components/ui";

export default function Dashboard() {
  const { runId, run, latest } = useLatestRun();
  const cands = useCandidates(runId);
  const profile = useConfigProfile(run.data?.config_version);
  const local = useLocalConstraints(cands.data?.candidates, profile.data);
  const jobs = useJobs();

  if (latest.isError) {
    return (
      <Empty>
        No runs published yet. The daily GitHub Actions scan writes <code>data/runs/</code>; until then there is nothing to show.
      </Empty>
    );
  }
  if (!run.data) return <Loading what="latest run" />;

  const r = run.data;
  const budget = local?.budget ?? r.budget;
  const riskPct = budget ? (budget.accepted_risk_amount + budget.open_risk_amount) / budget.capital * 100 : null;
  const riskCapPct = budget ? budget.risk_cap / budget.capital * 100 : null;
  const ranked = (cands.data?.candidates ?? []).filter((c) => (local?.bySymbol.get(`${c.symbol}:${c.side}`)?.rank_status ?? c.rank_status) === "ranked");
  const failedJobs = (jobs.data?.jobs ?? []).filter((j) => j.status === "failed" || j.status === "partial").slice(0, 3);

  return (
    <div className="space-y-4">
      <RegimeBanner run={r} />

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Counts">
          <div className="flex flex-wrap gap-4">
            <Stat label="Universe" value={r.counts.universe} unit="symbols" />
            <Stat label="Usable data" value={r.counts.usable} unit={`(${fmtPct(r.coverage_pct)})`} rule="Symbols passing the data-quality gates. Below min_universe_coverage_pct the run is degraded." />
            <Stat label="Data unavailable" value={r.counts.data_unavailable} rule="Missing bars, zero prices, gaps or stale last bar. Excluded, never defaulted." />
            <Stat label="Gate rejects" value={r.counts.rejected_gate} />
            <Stat label="Longs ranked" value={r.counts.ranked_long} />
            <Stat label="Shorts ranked" value={r.counts.ranked_short} />
            <Stat label="Deferred" value={r.counts.deferred} rule="Ranked but held back by portfolio risk, exposure, sector or position caps" />
            <Stat label="Fetch failures" value={r.failures.length} />
          </div>
        </Card>

        <Card title="Portfolio risk" right={local && local.openCount > 0 ? <span className="text-xs text-muted">incl. {local.openCount} open journal positions</span> : <span className="text-xs text-muted">no open journal positions</span>}>
          {budget ? (
            <div className="space-y-2">
              <div className="h-3 w-full overflow-hidden rounded bg-line" role="meter" aria-valuenow={riskPct ?? 0} aria-valuemin={0} aria-valuemax={riskCapPct ?? 100} aria-label="Portfolio risk against ceiling">
                <div className={`h-full ${riskPct != null && riskCapPct != null && riskPct >= riskCapPct ? "bg-short" : "bg-accent"}`} style={{ width: `${Math.min(100, riskPct != null && riskCapPct ? (riskPct / riskCapPct) * 100 : 0)}%` }} />
              </div>
              <div className="flex flex-wrap gap-4">
                <Stat label="Risk committed" value={fmtInr(budget.accepted_risk_amount + budget.open_risk_amount, 0)} unit={`= ${fmtPct(riskPct)} of capital`} rule="Sum of 1R across accepted + open positions" />
                <Stat label="Ceiling" value={fmtInr(budget.risk_cap, 0)} unit={`= ${fmtPct(riskCapPct)}`} rule="capital x max_portfolio_risk_pct. Enforced: candidates beyond it are deferred." />
                <Stat label="Gross exposure" value={fmtInr(budget.accepted_gross_value + budget.open_gross_value, 0)} unit={`/ ${fmtInr(budget.gross_cap, 0)}`} rule="Sum of position values vs capital x max_gross_exposure_pct" />
                <Stat label="Positions" value={budget.accepted_positions + budget.open_positions} />
              </div>
            </div>
          ) : (
            <Empty>No budget (scan did not run).</Empty>
          )}
        </Card>

        <Card title="Data quality">
          <div className="space-y-2 text-sm">
            <div>Universe: {r.universe.n_symbols} symbols, source <b>{r.universe.source}</b>, as of {r.universe.as_of}{r.universe.stale && <span className="text-warn"> (stale)</span>}</div>
            <div>Ban list: {r.ban_list.available ? <>{r.ban_list.n} symbols for {r.ban_list.as_of} ({r.ban_list.source})</> : <span className="text-warn">unavailable</span>}</div>
            <div>Coverage: {fmtPct(r.coverage_pct)} {r.status === "degraded" && <span className="text-warn">(degraded)</span>}</div>
            {r.failures.length > 0 && <div className="text-warn">{r.failures.length} symbol fetch failures — see Admin</div>}
            {failedJobs.length > 0 && (
              <div className="text-warn">Recent job issues: {failedJobs.map((j) => `${j.job} ${j.status}`).join(", ")}</div>
            )}
          </div>
        </Card>
      </div>

      <Card title={`Ranked setups (${ranked.length})`} right={<Link to={`/candidates/${runId}`} className="text-sm text-accent">All candidates →</Link>}>
        {ranked.length === 0 ? (
          <Empty>No ranked setups in this run.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr><th>#</th><th>Symbol</th><th>Side</th><th className="text-right">Score</th><th>Band</th><th className="text-right">Entry</th><th className="text-right">Stop</th><th className="text-right">Qty</th><th className="text-right">1R</th><th>Status</th></tr>
              </thead>
              <tbody>
                {ranked.map((c) => {
                  const lr = local?.bySymbol.get(`${c.symbol}:${c.side}`);
                  return (
                    <tr key={`${c.symbol}${c.side}`}>
                      <td className="mono">{lr?.rank ?? c.rank}</td>
                      <td><Link className="text-accent" to={`/plan/${runId}/${c.symbol}/${c.side}`}>{c.symbol}</Link><div className="text-xs text-muted">{c.sector ?? "—"}</div></td>
                      <td><SideBadge side={c.side} /></td>
                      <td className="mono text-right">{c.score.raw.toFixed(0)} pts</td>
                      <td>{c.score.band}</td>
                      <td className="mono text-right">{fmtInr(c.plan?.entry)}</td>
                      <td className="mono text-right">{fmtInr(c.plan?.stop)}</td>
                      <td className="mono text-right">{c.plan?.qty ?? "—"}</td>
                      <td className="mono text-right">{fmtInr(c.plan?.risk_amount, 0)}</td>
                      <td><RankBadge status={lr?.rank_status ?? c.rank_status} reason={lr?.rank_reason ?? c.rank_reason} />{c.warnings.length > 0 && <span className="ml-1 text-xs text-warn" title={c.warnings.join("; ")}>⚠</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {r.status === "degraded" && <div className="mt-3"><Warn>This run is <b>degraded</b> (coverage below threshold). Treat the list as incomplete.</Warn></div>}
        <div className="mt-3 text-xs text-muted">Status: <StatusBadge status={r.status} /> · Ranked means the setup matched the rules and fits within the configured caps. Nothing here is a prediction of price movement.</div>
      </Card>
    </div>
  );
}
