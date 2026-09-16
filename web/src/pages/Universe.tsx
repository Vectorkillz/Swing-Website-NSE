import { useMemo, useState } from "react";
import { useLatestRun, useUniverse } from "../lib/dataClient";
import { downloadCsv, downloadJson } from "../lib/export";
import { useScopeFilter } from "../lib/scope";
import { useSort } from "../lib/sort";
import type { CapBucket, UniverseRow } from "../lib/types";
import RefreshButton from "../components/RefreshButton";
import RowDetail from "../components/RowDetail";
import SearchBox, { type Scope } from "../components/SearchBox";
import UniverseTable, { UNI_DEFAULT_DIR, rowsToExport, sortRows, type UniKey } from "../components/UniverseTable";
import { IconDownload } from "../components/icons";
import { CAP_LABEL, Empty, Skeleton } from "../components/ui";

const CAPS: CapBucket[] = ["large", "mid", "small", "micro"];

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className="pill" aria-pressed={on} onClick={onClick}>{children}</button>;
}

export default function Universe() {
  const { runId, run } = useLatestRun();
  const uni = useUniverse(runId);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<Scope>("ALL");
  const [caps, setCaps] = useState<Set<CapBucket>>(new Set());
  const [stage, setStage] = useState<"all" | "stage2" | "stage4">("all");
  const [suitableOnly, setSuitableOnly] = useState(true);
  const [mbOnly, setMbOnly] = useState(false);
  const [sector, setSector] = useState("all");
  const [openSym, setOpenSym] = useState<string | null>(null);
  const sorter = useSort<UniKey>({ key: "rs", dir: "desc" }, UNI_DEFAULT_DIR);

  const rows = uni.data?.rows ?? [];
  const sectors = useMemo(() => Array.from(new Set(rows.map((r) => r.sector ?? "Unknown"))).sort(), [rows]);
  const scoped = useScopeFilter(rows, scope, q);
  const list = useMemo(() => {
    const f = scoped.rows.filter((r) =>
      (caps.size === 0 || caps.has(r.cap_bucket)) &&
      (stage === "all" || r.stage === stage) &&
      (!suitableOnly || r.swing_suitable) &&
      (!mbOnly || (r.multibagger && r.multibagger.level !== "none")) &&
      (sector === "all" || (r.sector ?? "Unknown") === sector),
    );
    return q.trim() ? f : sortRows(f, sorter.sorts);
  }, [scoped.rows, q, caps, stage, suitableOnly, mbOnly, sector, sorter.sorts]);

  function toggleCap(c: CapBucket) { const n = new Set(caps); n.has(c) ? n.delete(c) : n.add(c); setCaps(n); }

  if (!run.data || !uni.data) return <div className="space-y-3"><Skeleton h={60} /><Skeleton h={48} /><div className="table-wrap p-3 space-y-2">{Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} h={28} />)}</div></div>;
  const counts = run.data.counts;
  const openRow: UniverseRow | undefined = openSym ? rows.find((r) => r.symbol === openSym) : undefined;
  const stamp = run.data.session_date;

  return (
    <div className="space-y-4">
      <div className="fade-in flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">NSE universe</h1>
          <p className="mt-1 text-sm text-muted">{counts.universe} listed stocks scanned (long setups across the full cash-equity list; short setups restricted to the ~211 F&amp;O-eligible names) · {counts.swing_suitable} pass the swing tradability screen · {counts.multibagger_strong} strong and {counts.multibagger_watch} watch multibagger tags · session {stamp}</p>
        </div>
        <RefreshButton />
      </div>

      <div className="card space-y-3">
        <SearchBox q={q} onQ={setQ} scope={scope} onScope={setScope} counts={scoped.counts} disabledScopes={scoped.indexAvailable ? [] : ["NIFTY50", "NIFTY200", "SMALLCAP250"]} />
        <div className="flex flex-wrap items-center gap-2">
          {CAPS.map((c) => <Pill key={c} on={caps.has(c)} onClick={() => toggleCap(c)}>{CAP_LABEL[c]}</Pill>)}
          <span className="mx-1 text-ink/10">|</span>
          {(["all", "stage2", "stage4"] as const).map((s) => <Pill key={s} on={stage === s} onClick={() => setStage(s)}>{s === "all" ? "Any trend" : s === "stage2" ? "Stage 2 uptrend" : "Stage 4 downtrend"}</Pill>)}
          <span className="mx-1 text-ink/10">|</span>
          <Pill on={suitableOnly} onClick={() => setSuitableOnly(!suitableOnly)}>Swing-tradable</Pill>
          <Pill on={mbOnly} onClick={() => setMbOnly(!mbOnly)}>✦ Multibagger</Pill>
          <select className="input" value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector"><option value="all">All sectors</option>{sectors.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          <span className="ml-auto flex items-center gap-2 text-xs text-muted">
            {list.length} shown{q.trim() ? " · ranked by match" : sorter.sorts.length > 1 ? ` · ${sorter.sorts.length} sort keys` : ""}
            <button type="button" className="btn btn-sm" onClick={() => downloadCsv(`universe_${stamp}.csv`, rowsToExport(list))} title="Download the rows shown as CSV"><IconDownload size={14} /> CSV</button>
            <button type="button" className="btn btn-sm" onClick={() => downloadJson(`universe_${stamp}.json`, rowsToExport(list))} title="Download the rows shown as JSON"><IconDownload size={14} /> JSON</button>
          </span>
        </div>
      </div>

      {list.length === 0 ? <Empty>Nothing matches these filters.</Empty> : <UniverseTable rows={list} onOpen={(r) => setOpenSym(r.symbol)} sorter={sorter} />}
      {openRow && <RowDetail row={openRow} onClose={() => setOpenSym(null)} />}
      <p className="text-[11px] text-muted">Click a header to sort highest→lowest, again to flip; shift-click adds a secondary key. Swing-tradable = average volume above the configured minimum and ATR between 1.5% and 8% of price. The multibagger tag is a trend-template checklist, a heuristic, not a forecast. Screener columns (Vol ×, RSI, vs 20d high, HH/HL) come from the scan and are blank for sessions scanned before 16 Sep 2026.</p>
    </div>
  );
}
