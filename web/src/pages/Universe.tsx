import { useMemo, useState } from "react";
import { useLatestRun, useUniverse } from "../lib/dataClient";
import { fmtInr, fmtNum, fmtPct } from "../lib/format";
import { cmpNum, cmpStr, useSort, type SortDir } from "../lib/sort";
import type { CapBucket, UniverseRow } from "../lib/types";
import RefreshButton from "../components/RefreshButton";
import RowDetail from "../components/RowDetail";
import SortTh from "../components/SortTh";
import { CAP_LABEL, Empty, FnoBadge, MultibaggerBadge, Skeleton } from "../components/ui";

type SortKey = "symbol" | "cap" | "stage" | "close" | "rs" | "roc" | "from_high" | "atr" | "vol";
const DEFAULT_DIR: Record<SortKey, SortDir> = { symbol: "asc", cap: "desc", stage: "asc", close: "desc", rs: "desc", roc: "desc", from_high: "desc", atr: "desc", vol: "desc" };
const CAPS: CapBucket[] = ["large", "mid", "small", "micro"];
const STAGE_ORDER = { stage2: 0, transition: 1, stage4: 2 };

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className="pill" aria-pressed={on} onClick={onClick}>{children}</button>;
}

export function sortRows(rows: UniverseRow[], key: SortKey, dir: SortDir): UniverseRow[] {
  const c: Record<SortKey, (a: UniverseRow, b: UniverseRow) => number> = {
    symbol: (a, b) => cmpStr(a.symbol, b.symbol, dir),
    cap: (a, b) => cmpNum(a.market_cap_cr, b.market_cap_cr, dir),
    stage: (a, b) => cmpNum(a.stage ? STAGE_ORDER[a.stage] : null, b.stage ? STAGE_ORDER[b.stage] : null, dir),
    close: (a, b) => cmpNum(a.close, b.close, dir),
    rs: (a, b) => cmpNum(a.rs_vs_nifty, b.rs_vs_nifty, dir),
    roc: (a, b) => cmpNum(a.context?.roc_20, b.context?.roc_20, dir),
    from_high: (a, b) => cmpNum(a.context?.pct_from_52w_high, b.context?.pct_from_52w_high, dir),
    atr: (a, b) => cmpNum(a.context?.atr_pct, b.context?.atr_pct, dir),
    vol: (a, b) => cmpNum(a.context?.avg_volume_20, b.context?.avg_volume_20, dir),
  };
  return [...rows].sort((a, b) => c[key](a, b) || a.symbol.localeCompare(b.symbol));
}

export function UniverseTable({ rows, onOpen, sorter }: { rows: UniverseRow[]; onOpen: (r: UniverseRow) => void; sorter: ReturnType<typeof useSort<SortKey>> }) {
  const th = (k: SortKey, label: string, right = false, cls = "") => <SortTh k={k} label={label} ariaSort={sorter.ariaSort} onToggle={sorter.toggle} right={right} className={cls} />;
  return (
    <div className="card overflow-x-auto p-0">
      <table className="data" data-testid="universe-table">
        <thead><tr>{th("symbol", "Symbol")}{th("cap", "Cap")}{th("stage", "Trend")}{th("close", "Close", true)}{th("rs", "RS vs Nifty", true)}{th("roc", "20-bar", true)}{th("from_high", "From 52w high", true)}{th("atr", "ATR %", true)}{th("vol", "Avg vol", true, "hidden md:table-cell")}<th>Tags</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.symbol} className="row-link" onClick={() => onOpen(r)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(r); }} aria-label={`${r.symbol} detail`}>
              <td><div className="font-semibold">{r.symbol}</div><div className="text-[11px] text-muted">{r.sector ?? "—"}</div></td>
              <td className="text-xs text-muted">{CAP_LABEL[r.cap_bucket]}</td>
              <td><span className={`badge ${r.stage === "stage2" ? "bg-long/20 text-long" : r.stage === "stage4" ? "bg-short/20 text-short" : "bg-white/10 text-muted"}`}>{r.stage ?? "—"}</span></td>
              <td className="mono text-right">{fmtInr(r.close)}</td>
              <td className={`mono text-right ${(r.rs_vs_nifty ?? 0) >= 0 ? "text-long" : "text-short"}`}>{r.rs_vs_nifty == null ? "—" : `${r.rs_vs_nifty >= 0 ? "+" : ""}${r.rs_vs_nifty.toFixed(1)}`}</td>
              <td className="mono text-right">{fmtPct(r.context?.roc_20)}</td>
              <td className="mono text-right">{fmtPct(r.context?.pct_from_52w_high)}</td>
              <td className="mono text-right">{fmtPct(r.context?.atr_pct)}</td>
              <td className="mono text-right hidden md:table-cell">{fmtNum(r.context?.avg_volume_20)}</td>
              <td className="space-x-1 whitespace-nowrap">
                {r.setup_side && <span className={`badge ${r.setup_side === "long" ? "bg-long/20 text-long" : "bg-short/20 text-short"}`}>{r.setup_side} setup</span>}
                <FnoBadge eligible={r.fno_eligible} />
                {r.multibagger && <MultibaggerBadge level={r.multibagger.level} />}
                {r.swing_suitable === false && <span className="badge bg-white/5 text-muted" title={r.swing_notes.join("; ")}>not swing-tradable</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Universe() {
  const { runId, run } = useLatestRun();
  const uni = useUniverse(runId);
  const [q, setQ] = useState("");
  const [caps, setCaps] = useState<Set<CapBucket>>(new Set());
  const [stage, setStage] = useState<"all" | "stage2" | "stage4">("all");
  const [suitableOnly, setSuitableOnly] = useState(true);
  const [mbOnly, setMbOnly] = useState(false);
  const [fnoOnly, setFnoOnly] = useState(false);
  const [sector, setSector] = useState("all");
  const [openSym, setOpenSym] = useState<string | null>(null);
  const sorter = useSort<SortKey>({ key: "rs", dir: "desc" }, DEFAULT_DIR);

  const rows = uni.data?.rows ?? [];
  const sectors = useMemo(() => Array.from(new Set(rows.map((r) => r.sector ?? "Unknown"))).sort(), [rows]);
  const list = useMemo(() => {
    const f = rows.filter((r) =>
      (!q || r.symbol.includes(q.toUpperCase()) || (r.name ?? "").toLowerCase().includes(q.toLowerCase())) &&
      (caps.size === 0 || caps.has(r.cap_bucket)) &&
      (stage === "all" || r.stage === stage) &&
      (!suitableOnly || r.swing_suitable) &&
      (!mbOnly || (r.multibagger && r.multibagger.level !== "none")) &&
      (!fnoOnly || r.fno_eligible) &&
      (sector === "all" || (r.sector ?? "Unknown") === sector),
    );
    return sortRows(f, sorter.sort.key, sorter.sort.dir);
  }, [rows, q, caps, stage, suitableOnly, mbOnly, fnoOnly, sector, sorter.sort]);

  function toggleCap(c: CapBucket) { const n = new Set(caps); n.has(c) ? n.delete(c) : n.add(c); setCaps(n); }

  if (!run.data || !uni.data) return <div className="space-y-3"><Skeleton h={60} /><Skeleton h={400} /></div>;
  const counts = run.data.counts;
  const openRow = openSym ? rows.find((r) => r.symbol === openSym) : undefined;

  return (
    <div className="space-y-4">
      <div className="fade-in flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">NSE universe</h1>
          <p className="mt-1 text-sm text-muted">{counts.universe} listed stocks scanned (long setups across the full cash-equity list; short setups restricted to the ~211 F&amp;O-eligible names) · {counts.swing_suitable} pass the swing tradability screen · {counts.multibagger_strong} strong and {counts.multibagger_watch} watch multibagger tags · session {run.data.session_date}</p>
        </div>
        <RefreshButton />
      </div>
      <div className="card flex flex-wrap items-center gap-2">
        <input className="input w-44" placeholder="Search symbol" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search symbol" />
        {CAPS.map((c) => <Pill key={c} on={caps.has(c)} onClick={() => toggleCap(c)}>{CAP_LABEL[c]}</Pill>)}
        <span className="mx-1 text-white/10">|</span>
        {(["all", "stage2", "stage4"] as const).map((s) => <Pill key={s} on={stage === s} onClick={() => setStage(s)}>{s === "all" ? "Any trend" : s === "stage2" ? "Stage 2 uptrend" : "Stage 4 downtrend"}</Pill>)}
        <span className="mx-1 text-white/10">|</span>
        <Pill on={suitableOnly} onClick={() => setSuitableOnly(!suitableOnly)}>Swing-tradable</Pill>
        <Pill on={mbOnly} onClick={() => setMbOnly(!mbOnly)}>✦ Multibagger</Pill>
        <Pill on={fnoOnly} onClick={() => setFnoOnly(!fnoOnly)}>F&amp;O only</Pill>
        <select className="input" value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector"><option value="all">All sectors</option>{sectors.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <span className="ml-auto text-xs text-muted">{list.length} shown · click a column header to sort, again to flip</span>
      </div>
      {list.length === 0 ? <Empty>Nothing matches these filters.</Empty> : <UniverseTable rows={list} onOpen={(r) => setOpenSym(r.symbol)} sorter={sorter} />}
      {openRow && <RowDetail row={openRow} onClose={() => setOpenSym(null)} />}
      <p className="text-[11px] text-muted">Swing-tradable = average volume above the configured minimum and ATR between 1.5% and 8% of price. The multibagger tag is a trend-template checklist (Stage 2, above SMA150, 30%+ off the 52-week low, within 25% of the 52-week high, positive relative strength, not large cap; "strong" adds revenue or EPS growth). It is a heuristic, not a forecast.</p>
    </div>
  );
}
