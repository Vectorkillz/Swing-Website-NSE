import { useMemo, useState } from "react";
import { useLatestRun, useUniverse } from "../lib/dataClient";
import { downloadCsv, downloadJson } from "../lib/export";
import { fmtNum } from "../lib/format";
import { useScopeFilter } from "../lib/scope";
import { useSort } from "../lib/sort";
import type { CapBucket, UniverseRow } from "../lib/types";
import RefreshButton from "../components/RefreshButton";
import RowDetail from "../components/RowDetail";
import SearchBox, { type Scope } from "../components/SearchBox";
import UniverseTable, { UNI_DEFAULT_DIR, rowsToExport, sortRows, type UniKey } from "../components/UniverseTable";
import { IconBolt, IconDownload, IconFilter, IconTrendUp } from "../components/icons";
import { CAP_LABEL, Empty, Notice, Skeleton } from "../components/ui";

type Screen = "volume" | "pullback" | "custom";
const CAPS: CapBucket[] = ["large", "mid", "small", "micro"];

interface VolumeParams { minVolX: number; minBreak: number; stage2Only: boolean }
interface PullbackParams { maxDistPct: number; minRsi: number; ema: "20" | "50" | "either" }
interface CustomParams { priceMin: number; priceMax: number; minAvgVol: number; sector: string; trend: "any" | "hhhl" | "stage2" | "stage4"; caps: Set<CapBucket>; fnoOnly: boolean; minRsi: number | null; maxRsi: number | null }

const VOL_DEF: VolumeParams = { minVolX: 2, minBreak: 0, stage2Only: false };
const PB_DEF: PullbackParams = { maxDistPct: 3, minRsi: 50, ema: "either" };
const CUSTOM_DEF: CustomParams = { priceMin: 100, priceMax: 5000, minAvgVol: 300000, sector: "all", trend: "any", caps: new Set(), fnoOnly: false, minRsi: null, maxRsi: null };

export function volumeBreakout(r: UniverseRow, p: VolumeParams): boolean {
  const c = r.context;
  if (!c || c.vol_ratio_20 == null || c.pct_from_20d_high == null) return false;
  return c.vol_ratio_20 >= p.minVolX && c.pct_from_20d_high >= p.minBreak && (!p.stage2Only || r.stage === "stage2");
}
export function emaPullback(r: UniverseRow, p: PullbackParams): boolean {
  const c = r.context;
  if (!c || c.rsi14 == null || r.stage !== "stage2") return false;
  const near20 = c.dist_ema20_pct != null && Math.abs(c.dist_ema20_pct) <= p.maxDistPct;
  const near50 = c.dist_ema50_pct != null && Math.abs(c.dist_ema50_pct) <= p.maxDistPct;
  const near = p.ema === "20" ? near20 : p.ema === "50" ? near50 : near20 || near50;
  return near && c.rsi14 >= p.minRsi && (c.roc_20 ?? 0) > 0;
}
export function customRules(r: UniverseRow, p: CustomParams): boolean {
  const c = r.context;
  if (r.close == null) return false;
  if (r.close < p.priceMin || r.close > p.priceMax) return false;
  if ((c?.avg_volume_20 ?? 0) < p.minAvgVol) return false;
  if (p.sector !== "all" && (r.sector ?? "Unknown") !== p.sector) return false;
  if (p.caps.size > 0 && !p.caps.has(r.cap_bucket)) return false;
  if (p.fnoOnly && !r.fno_eligible) return false;
  if (p.trend === "hhhl" && c?.higher_highs_lows !== true) return false;
  if (p.trend === "stage2" && r.stage !== "stage2") return false;
  if (p.trend === "stage4" && r.stage !== "stage4") return false;
  if (p.minRsi != null && (c?.rsi14 == null || c.rsi14 < p.minRsi)) return false;
  if (p.maxRsi != null && (c?.rsi14 == null || c.rsi14 > p.maxRsi)) return false;
  return true;
}

function Num({ label, value, onChange, step = 1, min, max, suffix }: { label: string; value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; suffix?: string }) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      {label}
      <input type="number" className="input input-sm w-24" value={value} step={step} min={min} max={max} onChange={(e) => onChange(Number(e.target.value))} />
      {suffix}
    </label>
  );
}

export default function Screeners() {
  const { runId, run } = useLatestRun();
  const uni = useUniverse(runId);
  const [screen, setScreen] = useState<Screen>("volume");
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<Scope>("ALL");
  const [vol, setVol] = useState(VOL_DEF);
  const [pb, setPb] = useState(PB_DEF);
  const [cu, setCu] = useState(CUSTOM_DEF);
  const [openSym, setOpenSym] = useState<string | null>(null);
  const sorter = useSort<UniKey>({ key: screen === "volume" ? "volx" : screen === "pullback" ? "rs" : "rs", dir: "desc" }, UNI_DEFAULT_DIR);

  const rows = uni.data?.rows ?? [];
  const hasFields = useMemo(() => rows.some((r) => r.context?.rsi14 != null), [rows]);
  const sectors = useMemo(() => Array.from(new Set(rows.map((r) => r.sector ?? "Unknown"))).sort(), [rows]);
  const scoped = useScopeFilter(rows, scope, q);
  const matched = useMemo(() => {
    const f = scoped.rows.filter((r) => (screen === "volume" ? volumeBreakout(r, vol) : screen === "pullback" ? emaPullback(r, pb) : customRules(r, cu)));
    return q.trim() ? f : sortRows(f, sorter.sorts);
  }, [scoped.rows, screen, vol, pb, cu, q, sorter.sorts]);
  const totals = useMemo(() => ({ volume: rows.filter((r) => volumeBreakout(r, vol)).length, pullback: rows.filter((r) => emaPullback(r, pb)).length, custom: rows.filter((r) => customRules(r, cu)).length }), [rows, vol, pb, cu]);

  if (!run.data || !uni.data) return <div className="space-y-3"><Skeleton h={60} /><div className="bento"><Skeleton h={100} /><Skeleton h={100} /><Skeleton h={100} /></div><Skeleton h={300} /></div>;
  const openRow = openSym ? rows.find((r) => r.symbol === openSym) : undefined;
  const stamp = run.data.session_date;

  const tile = (k: Screen, icon: React.ReactNode, title: string, sub: string, n: number) => (
    <button type="button" className={`tile tile-kpi col-span-2 md:col-span-4`} aria-pressed={screen === k} onClick={() => { setScreen(k); sorter.setSort({ key: k === "volume" ? "volx" : "rs", dir: "desc" }); }} data-testid={`screen-${k}`}>
      <div className="flex items-center justify-between"><span className="label">{title}</span><span className="text-muted">{icon}</span></div>
      <div className="kpi">{n}</div>
      <div className="mt-1 text-[11px] text-muted">{sub}</div>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="fade-in flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Screeners</h1>
          <p className="mt-1 text-sm text-muted">Rule filters over the {fmtNum(rows.length)} scanned stocks for session {stamp}. Every value is end-of-day; nothing here is a setup with levels — open a row for its reasoning, or use the Scanner for full setups.</p>
        </div>
        <RefreshButton />
      </div>

      {!hasFields && <Notice>This run was scanned before the screener fields existed. Run <b>Daily scan</b> once (or wait for the next scheduled scan) to populate volume ratio, RSI and breakout columns.</Notice>}

      <section className="bento">
        {tile("volume", <IconBolt />, "Volume breakout", `Volume ≥ ${vol.minVolX}× 20-day avg and close above the prior 20-day high`, totals.volume)}
        {tile("pullback", <IconTrendUp />, "EMA pullback", `Stage 2, within ${pb.maxDistPct}% of EMA${pb.ema === "either" ? " 20 or 50" : pb.ema}, RSI ≥ ${pb.minRsi}`, totals.pullback)}
        {tile("custom", <IconFilter />, "Custom rules", `₹${cu.priceMin}–${cu.priceMax}, volume ≥ ${fmtNum(cu.minAvgVol)}${cu.trend !== "any" ? `, ${cu.trend === "hhhl" ? "HH/HL" : cu.trend}` : ""}`, totals.custom)}
      </section>

      <div className="card space-y-3">
        <SearchBox q={q} onQ={setQ} scope={scope} onScope={setScope} counts={scoped.counts} disabledScopes={scoped.indexAvailable ? [] : ["NIFTY50", "NIFTY200", "SMALLCAP250"]} />
        <div className="flex flex-wrap items-center gap-3" data-testid="screen-params">
          {screen === "volume" && (
            <>
              <Num label="Min volume ×" value={vol.minVolX} step={0.5} min={1} onChange={(n) => setVol({ ...vol, minVolX: n })} />
              <Num label="Min % above 20d high" value={vol.minBreak} step={0.5} onChange={(n) => setVol({ ...vol, minBreak: n })} suffix="%" />
              <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={vol.stage2Only} onChange={(e) => setVol({ ...vol, stage2Only: e.target.checked })} /> Stage 2 only</label>
              <button type="button" className="btn btn-sm" onClick={() => setVol(VOL_DEF)}>Reset</button>
            </>
          )}
          {screen === "pullback" && (
            <>
              <Num label="Max distance to EMA" value={pb.maxDistPct} step={0.5} min={0} onChange={(n) => setPb({ ...pb, maxDistPct: n })} suffix="%" />
              <Num label="Min RSI(14)" value={pb.minRsi} step={1} min={0} max={100} onChange={(n) => setPb({ ...pb, minRsi: n })} />
              <label className="flex items-center gap-2 text-xs text-muted">EMA
                <select className="input input-sm" value={pb.ema} onChange={(e) => setPb({ ...pb, ema: e.target.value as PullbackParams["ema"] })}><option value="either">20 or 50</option><option value="20">20</option><option value="50">50</option></select>
              </label>
              <button type="button" className="btn btn-sm" onClick={() => setPb(PB_DEF)}>Reset</button>
            </>
          )}
          {screen === "custom" && (
            <>
              <Num label="Price ₹" value={cu.priceMin} step={10} min={0} onChange={(n) => setCu({ ...cu, priceMin: n })} />
              <Num label="to ₹" value={cu.priceMax} step={10} min={0} onChange={(n) => setCu({ ...cu, priceMax: n })} />
              <Num label="Min avg volume" value={cu.minAvgVol} step={50000} min={0} onChange={(n) => setCu({ ...cu, minAvgVol: n })} />
              <label className="flex items-center gap-2 text-xs text-muted">Trend
                <select className="input input-sm" value={cu.trend} onChange={(e) => setCu({ ...cu, trend: e.target.value as CustomParams["trend"] })}><option value="any">Any</option><option value="hhhl">Higher highs / higher lows</option><option value="stage2">Stage 2</option><option value="stage4">Stage 4</option></select>
              </label>
              <select className="input input-sm" value={cu.sector} onChange={(e) => setCu({ ...cu, sector: e.target.value })} aria-label="Sector"><option value="all">All sectors</option>{sectors.map((s) => <option key={s} value={s}>{s}</option>)}</select>
              <label className="flex items-center gap-2 text-xs text-muted">RSI
                <input type="number" className="input input-sm w-16" placeholder="min" value={cu.minRsi ?? ""} onChange={(e) => setCu({ ...cu, minRsi: e.target.value === "" ? null : Number(e.target.value) })} />
                <input type="number" className="input input-sm w-16" placeholder="max" value={cu.maxRsi ?? ""} onChange={(e) => setCu({ ...cu, maxRsi: e.target.value === "" ? null : Number(e.target.value) })} />
              </label>
              <div className="flex flex-wrap gap-1">{CAPS.map((c) => <button key={c} type="button" className="pill pill-sm" aria-pressed={cu.caps.has(c)} onClick={() => { const n = new Set(cu.caps); n.has(c) ? n.delete(c) : n.add(c); setCu({ ...cu, caps: n }); }}>{CAP_LABEL[c]}</button>)}</div>
              <button type="button" className="pill pill-sm" aria-pressed={cu.fnoOnly} onClick={() => setCu({ ...cu, fnoOnly: !cu.fnoOnly })}>F&amp;O only</button>
              <button type="button" className="btn btn-sm" onClick={() => setCu(CUSTOM_DEF)}>Reset</button>
            </>
          )}
          <span className="ml-auto flex items-center gap-2 text-xs text-muted">
            {matched.length} match
            <button type="button" className="btn btn-sm" onClick={() => downloadCsv(`screen_${screen}_${stamp}.csv`, rowsToExport(matched))}><IconDownload size={14} /> CSV</button>
            <button type="button" className="btn btn-sm" onClick={() => downloadJson(`screen_${screen}_${stamp}.json`, rowsToExport(matched))}><IconDownload size={14} /> JSON</button>
          </span>
        </div>
      </div>

      {matched.length === 0 ? <Empty>No stock passes this screen with the current parameters{scope !== "ALL" ? " in this scope" : ""}.</Empty> : <UniverseTable rows={matched} onOpen={(r) => setOpenSym(r.symbol)} sorter={sorter} />}
      {openRow && <RowDetail row={openRow} onClose={() => setOpenSym(null)} />}
      <p className="text-[11px] text-muted">Definitions. Volume breakout: latest volume ÷ 20-day average ≥ threshold and close above the highest high of the prior 20 sessions. EMA pullback: Stage 2 trend, close within the distance band of EMA20/EMA50, RSI(14) at or above the floor, positive 20-bar change. Higher highs / higher lows compares the last 20 sessions with the 20 before. All from end-of-day bars; describes what happened, not what will.</p>
    </div>
  );
}
