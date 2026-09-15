import { Link, useParams } from "react-router-dom";
import { useCandidates, useChart, useConfigProfile, useRun } from "../lib/dataClient";
import { useLocalConstraints } from "../lib/useLocalConstraints";
import { fmtInr, fmtNum, fmtPct } from "../lib/format";
import type { Side } from "../lib/types";
import PlanTable from "../components/PlanTable";
import PriceChart from "../components/PriceChart";
import ReviewControls from "../components/ReviewControls";
import ScoreBars from "../components/ScoreBars";
import { Card, Empty, Loading, RankBadge, SideBadge, Stat, Warn } from "../components/ui";

export default function TradePlanPage() {
  const { runId, symbol, side } = useParams<{ runId: string; symbol: string; side: Side }>();
  const run = useRun(runId);
  const cands = useCandidates(runId);
  const chart = useChart(symbol);
  const profile = useConfigProfile(run.data?.config_version);
  const local = useLocalConstraints(cands.data?.candidates, profile.data);

  if (!cands.data || !run.data) return <Loading what="plan" />;
  const cand = cands.data.candidates.find((c) => c.symbol === symbol && c.side === side);
  if (!cand) return <Empty>No candidate {symbol} ({side}) in run {runId}.</Empty>;
  const plan = cand.plan;
  const lr = local?.bySymbol.get(`${cand.symbol}:${cand.side}`);
  const rValue = plan?.r_value ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`/candidates/${runId}`} className="text-sm text-accent">← Candidates</Link>
        <h1 className="text-xl font-semibold">{cand.symbol}</h1>
        <SideBadge side={cand.side} />
        <span className="text-sm text-muted">{cand.name ?? ""} · {cand.sector ?? "—"} · close {fmtInr(cand.close)} on {cand.last_bar_date}</span>
        <RankBadge status={lr?.rank_status ?? cand.rank_status} reason={lr?.rank_reason ?? cand.rank_reason} />
      </div>
      {cand.warnings.length > 0 && <Warn>{cand.warnings.join("; ")}</Warn>}
      {lr && lr.rank_status !== cand.rank_status && (
        <Warn level="info">Against your local journal ({local?.openCount} open positions) this candidate is <b>{lr.rank_status?.replace(/_/g, " ")}</b>{lr.rank_reason ? `: ${lr.rank_reason}` : ""}. The published run applied constraints with no open positions.</Warn>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-4">
          <Card title="Chart">{chart.data ? <PriceChart data={chart.data} height={420} /> : <Loading what="chart" />}</Card>
          {plan && (
            <Card title="Entry zone and stop">
              <div className="flex flex-wrap gap-6">
                <Stat label="Entry" value={fmtInr(plan.entry)} rule="close x (1 + long_entry_offset_pct) for longs; close x (1 - short_entry_offset_pct) for shorts" />
                {plan.entry_max != null && <Stat label="Do not chase above" value={fmtInr(plan.entry_max)} rule="entry_max = close x (1 + long_entry_max_offset_pct). Sizing assumes a fill here." />}
                <Stat label="Stop" value={fmtInr(plan.stop)} rule={`Bound by rule '${plan.stop_rule}'${plan.floor_applied ? " after the min_stop_distance_pct floor" : ""}`} />
                <Stat label="Stop distance" value={fmtPct(plan.stop_distance_pct, 2)} rule="(entry - stop)/entry; floor min_stop_distance_pct" />
                <Stat label="1R per share" value={fmtInr(plan.risk_per_share)} />
                <Stat label="ATR14" value={fmtInr(plan.atr14)} rule="Wilder ATR, 14 bars" />
                {plan.prev_bar_low != null && <Stat label="Prev bar low" value={fmtInr(plan.prev_bar_low)} />}
              </div>
              <h3 className="label mt-4 mb-1">Stop candidates (tightest wins, then the floor applies)</h3>
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(plan.stop_candidates).map(([k, v]) => (
                    <tr key={k} className={k === plan.stop_rule ? "text-text" : "text-muted"}>
                      <td className="py-0.5">{k}{k === plan.stop_rule && !plan.floor_applied ? " ← bound" : ""}</td>
                      <td className="mono py-0.5 text-right">{fmtInr(v)}</td>
                      <td className="mono py-0.5 text-right">{fmtPct(Math.abs(plan.entry - v) / plan.entry * 100, 2)} away</td>
                    </tr>
                  ))}
                  {plan.floor_applied && <tr className="text-warn"><td>floor ← bound</td><td className="mono text-right">{fmtInr(plan.stop)}</td><td className="mono text-right">{fmtPct(plan.stop_distance_pct, 2)} away</td></tr>}
                </tbody>
              </table>
            </Card>
          )}
          {plan && (
            <Card title="Size and caps">
              <ol className="space-y-1 text-sm">
                <li>1. Risk budget: capital x risk_per_trade_pct → <span className="mono">{fmtInr(plan.qty_raw * plan.risk_per_share, 0)}</span> ÷ 1R {fmtInr(plan.risk_per_share)} = <span className="mono">{fmtNum(plan.qty_raw)} shares</span></li>
                <li>2. Regime multiplier x{plan.regime_multiplier} → <span className="mono">{fmtNum(plan.qty_after_regime)} shares</span></li>
                <li>3. Position cap: qty x {fmtInr(plan.sizing_price)} must stay within max_position_pct_of_capital → <span className="mono">{fmtNum(plan.qty)} shares</span> = {fmtInr(plan.position_value, 0)}</li>
                {plan.caps_applied.length > 0 && <li className="text-warn">Caps applied: {plan.caps_applied.join("; ")}</li>}
                <li>Capital at risk (1R): <span className="mono">{fmtInr(plan.risk_amount, 0)}</span></li>
              </ol>
            </Card>
          )}
          {plan && (
            <Card title="Exits">
              <div className="overflow-x-auto">
                <table className="data">
                  <thead><tr><th>Level</th><th className="text-right">Price</th><th className="text-right">R</th><th>Action</th></tr></thead>
                  <tbody>
                    {plan.side === "long" ? (
                      <>
                        <tr><td>Breakeven trigger</td><td className="mono text-right">{fmtInr(plan.breakeven_trigger)}</td><td className="mono text-right">+{((plan.breakeven_trigger! - plan.entry) / rValue).toFixed(1)}R</td><td>Move stop to entry</td></tr>
                        <tr><td>Partial 1</td><td className="mono text-right">{fmtInr(plan.partial_1_price)}</td><td className="mono text-right">+{((plan.partial_1_price! - plan.entry) / rValue).toFixed(1)}R</td><td>Sell {fmtPct(plan.partial_1_pct, 0)} of qty</td></tr>
                        <tr><td>Partial 2</td><td className="mono text-right">{fmtInr(plan.partial_2_price)}</td><td className="mono text-right">+{((plan.partial_2_price! - plan.entry) / rValue).toFixed(1)}R</td><td>Sell {fmtPct(plan.partial_2_pct, 0)} of qty (entry +20%)</td></tr>
                        <tr><td>Stage 2 trail (weekly EMA{plan.trail_weekly_ema_len})</td><td className="mono text-right">{fmtInr(plan.trail_weekly_ema)}</td><td></td><td>Exit remainder on a weekly close below</td></tr>
                        <tr><td>Multibagger trail ({plan.trail_weekly_sma_len}-week SMA)</td><td className="mono text-right">{fmtInr(plan.trail_weekly_sma)}</td><td></td><td>Replaces the EMA trail after {fmtInr(plan.multibagger_arm_price)} (+40%)</td></tr>
                      </>
                    ) : (
                      <>
                        <tr><td>Target 1</td><td className="mono text-right">{fmtInr(plan.target_1_price)}</td><td className="mono text-right">+2R</td><td>Cover {fmtPct(plan.target_1_pct, 0)}</td></tr>
                        <tr><td>Target 2</td><td className="mono text-right">{fmtInr(plan.target_2_price)}</td><td className="mono text-right">+3R</td><td>Cover {fmtPct(plan.target_2_pct, 0)}</td></tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
              {plan.notes.length > 0 && <ul className="mt-2 list-disc pl-4 text-xs text-warn">{plan.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
            </Card>
          )}
          {!plan && <Warn level="error">No plan was generated for this candidate: {cand.warnings.join("; ") || "risk per share was not positive"}.</Warn>}
        </div>
        <div className="space-y-4">
          <Card title="Rule score"><ScoreBars score={cand.score} /></Card>
          {plan && <Card title="Plan summary"><PlanTable plan={plan} /></Card>}
          <Card title="Review"><ReviewControls runId={runId!} configVersion={run.data.config_version} cand={cand} /></Card>
          {cand.gate && (
            <Card title="Eligibility gates">
              <table className="w-full text-xs">
                <tbody>
                  {cand.gate.checks.map((g) => (
                    <tr key={g.field} className={g.outcome === "pass" ? "" : "text-warn"}>
                      <td className="py-0.5">{g.field}</td>
                      <td className="mono py-0.5 text-right">{g.value == null ? "missing" : fmtNum(g.value, 2)}</td>
                      <td className="mono py-0.5 text-right text-muted">{g.op} {fmtNum(g.threshold, 2)}</td>
                      <td className="py-0.5 text-right">{g.outcome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
