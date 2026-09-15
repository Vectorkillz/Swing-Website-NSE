import { useEffect } from "react";
import { useChart } from "../lib/dataClient";
import { fmtInr, fmtNum, fmtPct } from "../lib/format";
import type { Candidate } from "../lib/types";
import PriceChart from "./PriceChart";
import ScoreBars from "./ScoreBars";
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
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="drawer space-y-4" role="dialog" aria-label={`${cand.symbol} setup detail`}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-bold tracking-tight">{cand.symbol}</h2>
        <SideBadge side={cand.side} />
        {cand.grade && <GradeBadge grade={cand.grade.grade} reasons={cand.grade.reasons} />}
        <CapBadge bucket={cand.cap_bucket} />
        {cand.side === "long" && <FnoBadge eligible={cand.fno_eligible} />}
        {cand.multibagger && <MultibaggerBadge level={cand.multibagger.level} met={cand.multibagger.technical_met} total={cand.multibagger.technical_total} />}
        <span className="text-sm text-muted">{cand.name ?? ""}{cand.sector ? ` · ${cand.sector}` : ""}</span>
        <button className="btn ml-auto" onClick={onClose} aria-label="Close detail">Close ✕</button>
      </div>
      {cand.warnings.length > 0 && <Notice>{cand.warnings.join("; ")}</Notice>}

      {chart.data ? <PriceChart data={chart.data} height={380} /> : chart.isError ? <Empty>No chart file for {cand.symbol}.</Empty> : <Skeleton h={380} />}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h3 className="mb-2 text-sm font-semibold">Price plan</h3>
          {p ? (
            <>
              <div className="grid grid-cols-3 gap-3 pb-3">
                <Level big label={long ? "Buy zone" : "Sell zone"} value={fmtInr(p.entry)} tone={long ? "text-long" : "text-short"} />
                <Level big label="Target" value={fmtInr(p.target)} tone="text-blue" />
                <Level big label="Stop loss" value={fmtInr(p.stop)} tone="text-short" />
              </div>
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
          ) : <Notice level="error">No plan generated.</Notice>}
        </div>
        <div className="card">
          <h3 className="mb-2 text-sm font-semibold">Why it matched</h3>
          <p className="mb-3 text-sm text-muted">{cand.reason_text}</p>
          <ScoreBars score={cand.score} />
          {cand.grade && (
            <div className="mt-3 border-t border-white/5 pt-3 text-xs text-muted">
              <span className="mr-1 font-semibold text-text">Grade {cand.grade.grade}:</span>
              {cand.grade.reasons.join(" · ")}
            </div>
          )}
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
          <h3 className="mb-2 text-sm font-semibold">Multibagger checklist</h3>
          {cand.multibagger ? (
            <ul className="space-y-1">
              {Object.entries(cand.multibagger.criteria).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between"><span className="text-muted">{k.replace(/_/g, " ")}</span><span className={v == null ? "text-muted" : v ? "text-long" : "text-short"}>{v == null ? "n/a" : v ? "✓" : "✗"}</span></li>
              ))}
            </ul>
          ) : <Empty>Not computed.</Empty>}
          <p className="mt-3 text-[11px] text-muted">Heuristic trend-template criteria. Not backtested; use as a checklist, not a forecast.</p>
          {cand.fundamentals && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span>Mcap {fmtNum(cand.fundamentals.market_cap_cr, 0)} Cr</span>
              <span>ROE {fmtPct(cand.fundamentals.roe)}</span>
              <span>Rev {fmtPct(cand.fundamentals.revenue_growth)}</span>
              <span>EPS {fmtPct(cand.fundamentals.eps_growth)}</span>
              <span>D/E {cand.fundamentals.debt_equity == null ? "—" : cand.fundamentals.debt_equity.toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
