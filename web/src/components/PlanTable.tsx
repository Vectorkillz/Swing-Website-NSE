import type { TradePlan } from "../lib/types";
import { fmtInr, fmtNum, fmtPct } from "../lib/format";

const STOP_RULE_TEXT: Record<TradePlan["stop_rule"], string> = {
  pct: "entry x (1 - sl_pct)",
  atr: "entry - sl_atr_mult x ATR14",
  prev_low: "previous bar low x (1 - buffer)",
  floor: "min_stop_distance_pct floor (computed stop was tighter)",
};

function Row({ k, v, unit, rule }: { k: string; v: string; unit?: string; rule?: string }) {
  return (
    <tr>
      <td className="py-1 pr-3 text-muted">{rule ? <span className="tip" data-tip={rule} tabIndex={0}>{k}</span> : k}</td>
      <td className="mono py-1 text-right">{v}{unit && <span className="ml-1 text-xs text-muted">{unit}</span>}</td>
    </tr>
  );
}

export default function PlanTable({ plan, compact = false }: { plan: TradePlan; compact?: boolean }) {
  const long = plan.side === "long";
  return (
    <div className="text-sm">
      <table className="w-full">
        <tbody>
          <Row k="Entry" v={fmtInr(plan.entry)} rule={long ? "close x (1 + long_entry_offset_pct)" : "close x (1 - short_entry_offset_pct)"} />
          {plan.entry_max != null && <Row k="Entry max (do not chase)" v={fmtInr(plan.entry_max)} rule="close x (1 + long_entry_max_offset_pct). Sizing uses this worst-case price. A fill above it is flagged in the journal." />}
          <Row k={`Stop (${plan.stop_rule}${plan.floor_applied ? ", floored" : ""})`} v={fmtInr(plan.stop)} rule={`Bound by: ${STOP_RULE_TEXT[plan.stop_rule]}. Candidates: ${Object.entries(plan.stop_candidates).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(", ")}`} />
          <Row k="Stop distance" v={fmtPct(plan.stop_distance_pct, 2)} rule="(entry - stop) / entry. Floored at min_stop_distance_pct." />
          <Row k="Risk per share" v={fmtInr(plan.risk_per_share)} unit="INR" rule={`sizing price ${plan.sizing_price.toFixed(2)} minus stop`} />
          <Row k="Quantity" v={fmtNum(plan.qty)} unit="shares" rule={`floor(capital x risk_per_trade_pct / risk_per_share) = ${plan.qty_raw}; x regime ${plan.regime_multiplier} = ${plan.qty_after_regime}; caps: ${plan.caps_applied.join("; ") || "none"}`} />
          <Row k="Position value" v={fmtInr(plan.position_value, 0)} unit="INR" rule="qty x sizing price (<= capital x max_position_pct_of_capital)" />
          <Row k="Capital at risk" v={fmtInr(plan.risk_amount, 0)} unit="INR" rule="qty x risk per share (1R for the position)" />
          {!compact && long && (
            <>
              <Row k="Breakeven stop at" v={fmtInr(plan.breakeven_trigger)} rule="entry + breakeven_at_r x R" />
              <Row k={`Partial 1 (${fmtPct(plan.partial_1_pct, 0)} of qty)`} v={fmtInr(plan.partial_1_price)} rule="entry + partial_exit_1_r x R" />
              <Row k={`Partial 2 (${fmtPct(plan.partial_2_pct, 0)} of qty)`} v={fmtInr(plan.partial_2_price)} rule="entry x (1 + partial_exit_2_gain_pct)" />
              <Row k={`Stage 2 trail: weekly EMA${plan.trail_weekly_ema_len ?? ""}`} v={fmtInr(plan.trail_weekly_ema)} rule={`True weekly EMA from ${plan.weekly_bars_available ?? "?"} weekly bars (resampled W-FRI). Exit on weekly close below.`} />
              <Row k={`Multibagger trail: ${plan.trail_weekly_sma_len ?? ""}-week SMA`} v={fmtInr(plan.trail_weekly_sma)} rule={`Arms after +${((plan.multibagger_arm_price ?? 0) / plan.entry * 100 - 100).toFixed(0)}% (${fmtInr(plan.multibagger_arm_price)}). Exit on weekly close below.`} />
            </>
          )}
          {!compact && !long && (
            <>
              <Row k={`Target 1 (${fmtPct(plan.target_1_pct, 0)} of qty)`} v={fmtInr(plan.target_1_price)} rule="entry - short_target_1_r x R" />
              <Row k={`Target 2 (${fmtPct(plan.target_2_pct, 0)} of qty)`} v={fmtInr(plan.target_2_price)} rule="entry - short_target_2_r x R" />
            </>
          )}
        </tbody>
      </table>
      {plan.notes.length > 0 && (
        <ul className="mt-2 list-disc pl-4 text-xs text-warn">
          {plan.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
    </div>
  );
}
