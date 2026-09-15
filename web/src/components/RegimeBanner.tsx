import type { Run } from "../lib/types";
import { ageDays, fmtDateTime, fmtNum, fmtPct } from "../lib/format";
import { RegimeBadge, Stat, Warn } from "./ui";

export default function RegimeBanner({ run }: { run: Run }) {
  const r = run.regime;
  const age = ageDays(run.generated_at);
  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <RegimeBadge regime={r.regime} />
        <span className="text-sm text-muted">Session {run.session_date}</span>
        <span className="text-xs text-muted">generated {fmtDateTime(run.generated_at)}{age != null && age > 3 ? ` (${age} days ago)` : ""}</span>
        <span className="ml-auto text-xs text-muted">config {run.config_version} · engine {run.engine_version}</span>
      </div>
      <div className="flex flex-wrap gap-6">
        <Stat label="Nifty close" value={fmtNum(r.nifty_close, 0)} rule="Nifty 50 last close" />
        <Stat label="EMA10 / EMA20" value={`${fmtNum(r.nifty_ema_fast, 0)} / ${fmtNum(r.nifty_ema_slow, 0)}`} rule="BULL needs close above both; BEAR needs close below both" />
        <Stat label={`ROC(${r.roc_bars_used ?? "18m"})`} value={fmtPct(r.roc_18m)} rule="Nifty rate of change over min(378, len-1) bars; BULL band is roc_bull_min..roc_bull_max" />
        <Stat label="India VIX" value={fmtNum(r.vix, 2)} rule="BULL with VIX above vix_long_suppress becomes BULL_HIGH_VIX (size x0.5). Missing VIX => UNKNOWN, never defaulted." />
        <Stat label="Size multiplier" value={r.size_multiplier == null ? "—" : `x${r.size_multiplier}`} rule="Regime effects table: BULL 1.0, BULL_HIGH_VIX 0.5, NEUTRAL 0.75, BEAR 1.0" />
        <Stat label="Longs / Shorts" value={`${r.longs_allowed ? "yes" : "no"} / ${r.shorts_allowed ? "yes" : "no"}`} rule="From the regime effects table and allow_shorts_in_bull_high_vix" />
        <Stat label="Smallcap confirms" value={r.smallcap_confirms == null ? "unavailable" : r.smallcap_confirms ? "yes" : "no"} rule="Nifty Smallcap 100 close > EMA10 and > EMA20. Display only unless require_smallcap_confirmation_for_bull is on." />
      </div>
      {r.reasons.length > 0 && <div className="text-xs text-muted">{r.reasons.join(" · ")}</div>}
      {run.status !== "ok" && (
        <Warn level={run.status === "no_scan_regime_unknown" ? "error" : "warn"}>
          Run status <b>{run.status}</b>{run.warnings.length ? `: ${run.warnings.join("; ")}` : ""}
        </Warn>
      )}
      {!run.ban_list.available && <Warn>F&amp;O ban list unavailable{run.ban_list.live_error ? ` (${run.ban_list.live_error})` : ""}. Short candidates cannot be verified against the ban list.</Warn>}
      {run.universe.stale && <Warn>Universe snapshot is {run.universe.age_days} days old (source {run.universe.source}, as of {run.universe.as_of}). Upload a fresh data/universe/fno_universe.csv.</Warn>}
    </div>
  );
}
