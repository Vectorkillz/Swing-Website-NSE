import { useMemo } from "react";
import { useChart } from "../lib/dataClient";
import { fmtInr, fmtNum, fmtPct } from "../lib/format";
import { buildCandidateReasoning } from "../lib/reasoning";
import type { Candidate } from "../lib/types";
import Drawer from "./Drawer";
import PriceChart from "./PriceChart";
import ReasoningPanel from "./Reasoning";
import ScoreBars from "./ScoreBars";
import StarButton from "./StarButton";
import { CapBadge, Empty, FnoBadge, GradeBadge, Level, MultibaggerBadge, Notice, SideBadge, Skeleton } from "./ui";

function Row({ k, v, rule }: { k: string; v: string; rule?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
      <span className="text-muted">{rule ? <span className="tip" data-tip={rule} tabIndex={0}>{k}</span> : k}</span>
      <span className="mono">{v}</span>
    </div>
  );
}

export default function SetupDetail({ cand, onClose }: { cand: Candidate; onClose: () => void }) {
  const chart = useChart(cand.symbol);
  const p = cand.plan;
  const long = cand.side === "long";
  const reasoning = useMemo(() => buildCandidateReasoning(cand), [cand]);

  const title = (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-2xl font-bold tracking-tight">{cand.symbol}</h2>
      <StarButton symbol={cand.symbol} size={18} />
      <SideBadge side={cand.side} />
      {cand.grade && <GradeBadge grade={cand.grade.grade} reasons={cand.grade.reasons} />}
      <CapBadge bucket={cand.cap_bucket} />
      <FnoBadge eligible={cand.fno_eligible} />
      {cand.multibagger && <MultibaggerBadge level={cand.multibagger.level} met={cand.multibagger.technical_met} total={cand.multibagger.technical_total} />}
      <span className="w-full text-sm text-muted sm:w-auto">{cand.name ?? ""}{cand.sector ? ` · ${cand.sector}` : ""} · close {fmtInr(cand.close)} on {cand.last_bar_date}</span>
    </div>
  );

  return (
    <Drawer title={title} onClose={onClose} label={`${cand.symbol} setup detail`}>
      <div className="space-y-4">
        {cand.warnings.length > 0 && <Notice>{cand.warnings.join("; ")}</Notice>}

        <ReasoningPanel r={reasoning} />

        {p && (
          <div className="bento">
            <div className="tile tile-kpi col-span-2 md:col-span-4"><Level big label={long ? "Buy zone" : "Sell zone"} value={<>{fmtInr(p.entry)}{p.entry_max != null && <span className="block text-xs text-muted">do not chase above {fmtInr(p.entry_max)}</span>}</>} tone={long ? "text-long" : "text-short"} /></div>
            <div className="tile tile-kpi md:col-span-4"><Level big label="Target" value={<>{fmtInr(p.target)}<span className="block text-xs text-muted">{p.reward_risk.toFixed(1)}R · extended {fmtInr(p.extended_target)}</span></>} tone="text-blue" /></div>
            <div className="tile tile-kpi md:col-span-4"><Level big label="Stop loss" value={<>{fmtInr(p.stop)}<span className="block text-xs text-muted">{fmtPct(p.stop_distance_pct, 1)} away · {p.stop_rule}{p.floor_applied ? ", floored" : ""}</span></>} tone="text-short" /></div>
          </div>
        )}

        {chart.data ? <PriceChart data={chart.data} height={380} /> : chart.isError ? <Empty>No chart file for {cand.symbol}.</Empty> : <Skeleton h={380} />}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="card">
            <h3 className="mb-2 text-sm font-semibold">Price plan</h3>
            {p ? (
              <>
                {p.entry_max != null && <Row k="Do not chase above" v={fmtInr(p.entry_max)} rule="close x (1 + 0.8%). Risk per share is measured from this worst-case price." />}
                <Row k="Reward : risk" v={`${p.reward_risk.toFixed(2)} : 1`} rule="(target - entry) / risk per share. Never below the configured minimum." />
                <Row k="Target rule" v={p.target_rule === "structure" ? (long ? "momentum-leg high" : "20-bar low") : p.target_rule === "min_rr" ? "structure inside 1R → 2R" : "2R fallback"} />
                <Row k={`Extended target (${p.extended_target_r}R)`} v={fmtInr(p.extended_target)} />
                <Row k={`Stop rule (${p.stop_rule}${p.floor_applied ? ", floored" : ""})`} v={fmtPct(p.stop_distance_pct, 2) + " away"} rule={`Candidates: ${Object.entries(p.stop_candidates).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(" · ")}`} />
                <Row k="Risk per share (1R)" v={fmtInr(p.r_value)} />
                <Row k="ATR14" v={fmtInr(p.atr14)} />
                {long && p.breakeven_trigger != null && <Row k="Move stop to breakeven at" v={fmtInr(p.breakeven_trigger)} rule="entry + 2R" />}
                {long && <Row k={`Trail: weekly EMA${p.trail_weekly_ema_len}`} v={fmtInr(p.trail_weekly_ema)} rule="Exit remainder on a weekly close below. Real weekly bars." />}
                {long && <Row k={`After +40%: ${p.trail_weekly_sma_len}-week SMA`} v={fmtInr(p.trail_weekly_sma)} rule={`Arms above ${fmtInr(p.multibagger_arm_price)}; exit on a weekly close below.`} />}
                {p.notes.length > 0 && <ul className="mt-2 list-disc pl-4 text-xs text-warn">{p.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
              </>
            ) : <Notice level="error">No plan generated: {cand.warnings.join("; ") || "risk per share not positive"}.</Notice>}
          </div>
          <div className="card">
            <h3 className="mb-2 text-sm font-semibold">Score breakdown</h3>
            <p className="mb-3 text-xs text-muted">{cand.reason_text}</p>
            <ScoreBars score={cand.score} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="card text-sm">
            <h3 className="mb-2 text-sm font-semibold">Context</h3>
            {cand.context && (
              <>
                <Row k="52-week high / low" v={`${fmtInr(cand.context.high_52w)} / ${fmtInr(cand.context.low_52w)}`} />
                <Row k="From 52-week high" v={fmtPct(cand.context.pct_from_52w_high)} />
                <Row k="Above 52-week low" v={fmtPct(cand.context.pct_above_52w_low)} />
                <Row k="ATR14 % of price" v={fmtPct(cand.context.atr_pct)} />
                <Row k="20-bar change" v={fmtPct(cand.context.roc_20)} />
                <Row k="Avg volume (20)" v={fmtNum(cand.context.avg_volume_20)} />
              </>
            )}
            <Row k="RS vs Nifty (20 bars)" v={cand.rs_vs_nifty == null ? "—" : `${cand.rs_vs_nifty >= 0 ? "+" : ""}${cand.rs_vs_nifty.toFixed(1)} pp`} />
            {cand.leg && <Row k="Momentum leg" v={`${fmtPct(cand.leg.move_pct)} · ${cand.leg.start_date} → ${cand.leg.end_date}`} />}
            {cand.vcp && <Row k="Pullback / volume" v={`${fmtPct(cand.vcp.depth_pct)} · ${fmtPct(cand.vcp.vol_dry_pct, 0)} of leg`} />}
            {cand.bar_pattern?.kind && <Row k={`Trigger (${cand.bar_pattern.kind})`} v={fmtInr(cand.bar_pattern.trigger)} />}
          </div>
          <div className="card text-sm">
            <h3 className="mb-2 text-sm font-semibold">Fundamentals &amp; multibagger checklist</h3>
            {cand.fundamentals ? (
              <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                {([["Market cap", cand.fundamentals.market_cap_cr == null ? "—" : `${fmtNum(cand.fundamentals.market_cap_cr, 0)} Cr`], ["ROE", fmtPct(cand.fundamentals.roe)], ["Revenue growth", fmtPct(cand.fundamentals.revenue_growth)], ["EPS growth", fmtPct(cand.fundamentals.eps_growth)], ["Debt / equity", cand.fundamentals.debt_equity == null ? "—" : cand.fundamentals.debt_equity.toFixed(2)], ["Free cash flow", cand.fundamentals.fcf_positive == null ? "—" : cand.fundamentals.fcf_positive ? "positive" : "negative"]] as [string, string][]).map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-bg/50 p-2"><div className="label">{k}</div><div className="mono mt-0.5 text-sm">{v}</div></div>
                ))}
              </div>
            ) : <p className="mb-3 text-xs text-muted">No fundamentals stored for this symbol.</p>}
            {cand.multibagger ? (
              <ul className="space-y-1">
                {Object.entries(cand.multibagger.criteria).map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between"><span className="text-muted">{k.replace(/_/g, " ")}</span><span className={v == null ? "text-muted" : v ? "text-long" : "text-short"}>{v == null ? "n/a" : v ? "✓" : "✗"}</span></li>
                ))}
              </ul>
            ) : <Empty>Not computed.</Empty>}
            <p className="mt-3 text-[11px] text-muted">Heuristic trend-template criteria. Not backtested; use as a checklist, not a forecast.</p>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
