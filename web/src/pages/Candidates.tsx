import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCandidates, useChart, useConfigProfile, useRunIndex } from "../lib/dataClient";
import { useLatestRun } from "../lib/useLatestRun";
import { useLocalConstraints } from "../lib/useLocalConstraints";
import { fmtInr, fmtNum, fmtPct } from "../lib/format";
import type { Candidate, Side } from "../lib/types";
import PriceChart from "../components/PriceChart";
import ScoreBars from "../components/ScoreBars";
import PlanTable from "../components/PlanTable";
import ReviewControls from "../components/ReviewControls";
import { Card, Empty, Loading, RankBadge, SideBadge, Warn } from "../components/ui";

type SortKey = "rank" | "score" | "symbol" | "sector" | "risk";

function DetailPanel({ runId, configVersion, cand }: { runId: string; configVersion: string; cand: Candidate }) {
  const chart = useChart(cand.symbol);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-3">
        {chart.data ? <PriceChart data={chart.data} /> : chart.isError ? <Empty>No chart file for {cand.symbol}.</Empty> : <Loading what="chart" />}
        <div className="text-sm text-muted">{cand.reason_text}</div>
        {cand.leg && cand.vcp && (
          <div className="flex flex-wrap gap-4 text-xs">
            <span className="tip" data-tip="Best 22-bar window inside the last 42 bars" tabIndex={0}>Leg {fmtPct(cand.leg.move_pct)} ({cand.leg.start_date} → {cand.leg.end_date}, age {cand.leg.age_bars} bars)</span>
            <span className="tip" data-tip="(leg high - close) / leg high" tabIndex={0}>Depth {fmtPct(cand.vcp.depth_pct)}</span>
            <span className="tip" data-tip="mean volume last 10 bars / leg mean volume" tabIndex={0}>Volume {fmtPct(cand.vcp.vol_dry_pct, 0)} of leg</span>
            <span className="tip" data-tip="symbol ROC(n) minus Nifty ROC(n), rs_lookback_bars" tabIndex={0}>RS vs Nifty {cand.rs_vs_nifty == null ? "—" : `${cand.rs_vs_nifty >= 0 ? "+" : ""}${cand.rs_vs_nifty.toFixed(1)} pp`}</span>
            {cand.bar_pattern?.kind && <span>Trigger {cand.bar_pattern.kind} @ {fmtInr(cand.bar_pattern.trigger)}</span>}
          </div>
        )}
        {cand.short_signals && (
          <div className="flex flex-wrap gap-3 text-xs">
            {Object.entries({ stage4: "Stage 4", downtrend: "Downtrend", double_top: "Double top", weak_bounce: "Weak bounce", low_vol_bounce: "Low-vol bounce", red_confirm: "Red bar" }).map(([k, label]) => (
              <span key={k} className={`badge ${(cand.short_signals as unknown as Record<string, boolean>)[k] ? "bg-short/20 text-short" : "bg-line text-muted"}`}>{label}</span>
            ))}
            <span className="text-muted">weak-bounce method: {cand.short_signals.weak_bounce_method}</span>
          </div>
        )}
        {cand.fundamentals && (
          <div className="flex flex-wrap gap-4 text-xs text-muted">
            <span>Mcap {fmtNum(cand.fundamentals.market_cap_cr, 0)} Cr</span>
            <span>Avg vol {fmtNum(cand.fundamentals.avg_volume, 0)}</span>
            <span>D/E {cand.fundamentals.debt_equity == null ? "missing" : cand.fundamentals.debt_equity.toFixed(2)} (ratio)</span>
            <span>ROE {fmtPct(cand.fundamentals.roe)}</span>
            <span>Rev {fmtPct(cand.fundamentals.revenue_growth)} YoY</span>
            <span>EPS {fmtPct(cand.fundamentals.eps_growth)} YoY</span>
            <span>FCF {cand.fundamentals.fcf_positive == null ? "missing" : cand.fundamentals.fcf_positive ? "positive" : "negative"}</span>
          </div>
        )}
      </div>
      <div className="space-y-4">
        <Card title="Rule score"><ScoreBars score={cand.score} /></Card>
        <Card title="Plan" right={<Link className="text-xs text-accent" to={`/plan/${runId}/${cand.symbol}/${cand.side}`}>Full plan →</Link>}>
          {cand.plan ? <PlanTable plan={cand.plan} compact /> : <Warn>No plan generated: {cand.warnings.join("; ") || "risk per share not positive"}</Warn>}
          {cand.warnings.length > 0 && cand.plan && <div className="mt-2"><Warn>{cand.warnings.join("; ")}</Warn></div>}
        </Card>
        <Card title="Review"><ReviewControls runId={runId} configVersion={configVersion} cand={cand} /></Card>
      </div>
    </div>
  );
}

export default function Candidates() {
  const params = useParams<{ runId?: string }>();
  const { runId, run } = useLatestRun(params.runId);
  const index = useRunIndex();
  const cands = useCandidates(runId);
  const profile = useConfigProfile(run.data?.config_version);
  const local = useLocalConstraints(cands.data?.candidates, profile.data);

  const [side, setSide] = useState<Side | "all">("all");
  const [minScore, setMinScore] = useState(0);
  const [sector, setSector] = useState("all");
  const [sort, setSort] = useState<SortKey>("rank");
  const [open, setOpen] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);

  const rows = useMemo(() => {
    const all = cands.data?.candidates ?? [];
    const filtered = all.filter((c) => (side === "all" || c.side === side) && c.score.raw >= minScore && (sector === "all" || (c.sector ?? "—") === sector));
    const rankOf = (c: Candidate) => local?.bySymbol.get(`${c.symbol}:${c.side}`)?.rank ?? c.rank ?? 999;
    const sorters: Record<SortKey, (a: Candidate, b: Candidate) => number> = {
      rank: (a, b) => (a.side === b.side ? rankOf(a) - rankOf(b) : a.side === "long" ? -1 : 1),
      score: (a, b) => b.score.raw - a.score.raw,
      symbol: (a, b) => a.symbol.localeCompare(b.symbol),
      sector: (a, b) => (a.sector ?? "").localeCompare(b.sector ?? ""),
      risk: (a, b) => (b.plan?.risk_amount ?? 0) - (a.plan?.risk_amount ?? 0),
    };
    return [...filtered].sort(sorters[sort]);
  }, [cands.data, side, minScore, sector, sort, local]);

  const sectors = useMemo(() => Array.from(new Set((cands.data?.candidates ?? []).map((c) => c.sector ?? "—"))).sort(), [cands.data]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(rows.length - 1, c + 1)); }
      if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const r = rows[cursor]; if (r) setOpen((o) => (o === `${r.symbol}:${r.side}` ? null : `${r.symbol}:${r.side}`)); }
      if (e.key === "Escape") setOpen(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, cursor]);

  if (!runId) return <Loading what="run list" />;
  if (cands.isError) return <Empty>No candidates file for run {runId}.</Empty>;
  if (!cands.data || !run.data) return <Loading what="candidates" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1">Run
          <select className="input w-auto" value={runId} onChange={(e) => (window.location.hash = `#/candidates/${e.target.value}`)}>
            {(index.data?.runs ?? [{ run_id: runId }]).map((r) => <option key={r.run_id} value={r.run_id}>{r.run_id}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">Side
          <select className="input w-auto" value={side} onChange={(e) => setSide(e.target.value as Side | "all")}><option value="all">all</option><option value="long">long</option><option value="short">short</option></select>
        </label>
        <label className="flex items-center gap-1">Min score
          <input className="input w-20" type="number" min={0} max={105} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} /> pts
        </label>
        <label className="flex items-center gap-1">Sector
          <select className="input w-auto" value={sector} onChange={(e) => setSector(e.target.value)}><option value="all">all</option>{sectors.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        </label>
        <label className="flex items-center gap-1">Sort
          <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}><option value="rank">rank</option><option value="score">score</option><option value="symbol">symbol</option><option value="sector">sector</option><option value="risk">capital at risk</option></select>
        </label>
        <span className="ml-auto text-xs text-muted">j/k move · Enter expand · Esc close</span>
      </div>

      {!run.data.ban_list.available && side !== "long" && <Warn>Ban list unavailable for this run: short setups could not be checked against the F&amp;O ban list.</Warn>}

      {rows.length === 0 ? (
        <Empty>No candidates match the filters.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr><th>#</th><th>Symbol</th><th>Side</th><th className="text-right">Score</th><th className="hidden sm:table-cell text-right">Close</th><th className="text-right">Entry</th><th className="text-right">Stop</th><th className="hidden md:table-cell text-right">Qty</th><th className="hidden md:table-cell text-right">1R</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((c, i) => {
                const key = `${c.symbol}:${c.side}`;
                const lr = local?.bySymbol.get(key);
                const isOpen = open === key;
                return (
                  <Fragment key={key}>
                    <tr data-selected={i === cursor} tabIndex={0} className="cursor-pointer" onClick={() => { setCursor(i); setOpen(isOpen ? null : key); }} onFocus={() => setCursor(i)} aria-expanded={isOpen}>
                      <td className="mono">{lr?.rank ?? c.rank ?? "—"}</td>
                      <td><span className="font-medium">{c.symbol}</span><div className="text-xs text-muted">{c.sector ?? "—"}</div></td>
                      <td><SideBadge side={c.side} /></td>
                      <td className="mono text-right">{c.score.raw.toFixed(0)} <span className="text-xs text-muted">pts · {c.score.band}</span></td>
                      <td className="mono hidden sm:table-cell text-right">{fmtInr(c.close)}</td>
                      <td className="mono text-right">{fmtInr(c.plan?.entry)}</td>
                      <td className="mono text-right">{fmtInr(c.plan?.stop)}{c.plan?.floor_applied && <span className="ml-1 text-xs text-warn" title="stop distance floored">F</span>}</td>
                      <td className="mono hidden md:table-cell text-right">{c.plan?.qty ?? "—"}</td>
                      <td className="mono hidden md:table-cell text-right">{fmtInr(c.plan?.risk_amount, 0)}</td>
                      <td><RankBadge status={lr?.rank_status ?? c.rank_status} reason={lr?.rank_reason ?? c.rank_reason} />{c.warnings.length > 0 && <span className="ml-1 text-xs text-warn" title={c.warnings.join("; ")}>⚠</span>}</td>
                    </tr>
                    {isOpen && (
                      <tr><td colSpan={10} className="bg-bg/40 p-3"><DetailPanel runId={runId} configVersion={run.data!.config_version} cand={c} /></td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
