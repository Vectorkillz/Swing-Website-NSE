import { useMemo, useState } from "react";
import { useCandidates, useLatestRun, useUniverse } from "../lib/dataClient";
import { fmtNum } from "../lib/format";
import { useSort, type SortDir } from "../lib/sort";
import type { Candidate, Side, UniverseRow } from "../lib/types";
import CardSortBar, { CARD_SORT_DEFAULT_DIR, candidateComparator, type CardSortKey } from "../components/CardSortBar";
import RefreshButton from "../components/RefreshButton";
import RowDetail from "../components/RowDetail";
import SetupCard from "../components/SetupCard";
import SetupDetail from "../components/SetupDetail";
import { IconBolt, IconLayers, IconTrendDown, IconTrendUp } from "../components/icons";
import { Empty, Notice, RegimeBadge, Skeleton } from "../components/ui";
import { UniverseTable, sortRows } from "./Universe";

type SortKey = "symbol" | "cap" | "stage" | "close" | "rs" | "roc" | "from_high" | "atr" | "vol";
const DEFAULT_DIR: Record<SortKey, SortDir> = { symbol: "asc", cap: "desc", stage: "asc", close: "desc", rs: "desc", roc: "desc", from_high: "desc", atr: "desc", vol: "desc" };

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className="pill" aria-pressed={on} onClick={onClick}>{children}</button>;
}

/** Momentum screen for F&O names that did not produce a full setup: trend, relative strength and 20-bar move all agree. */
function momentumSide(r: UniverseRow): Side | null {
  if (!r.fno_eligible || !r.swing_suitable) return null;
  const rs = r.rs_vs_nifty, roc = r.context?.roc_20;
  if (rs == null || roc == null) return null;
  if (r.stage === "stage2" && rs > 0 && roc > 0) return "long";
  if (r.stage === "stage4" && rs < 0 && roc < 0) return "short";
  return null;
}

export default function Optionable() {
  const { runId, run } = useLatestRun();
  const cands = useCandidates(runId);
  const uni = useUniverse(runId);
  const [side, setSide] = useState<Side | "all">("all");
  const [rankedOnly, setRankedOnly] = useState(false);
  const [openCand, setOpenCand] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const cardSorter = useSort<CardSortKey>({ key: "grade", dir: "desc" }, CARD_SORT_DEFAULT_DIR);
  const tableSorter = useSort<SortKey>({ key: "rs", dir: "desc" }, DEFAULT_DIR);

  const all = cands.data?.candidates ?? [];
  const setups = useMemo(() => {
    const f = all.filter((c) => c.fno_eligible && (side === "all" || c.side === side) && (!rankedOnly || c.rank_status === "ranked"));
    const cmp = candidateComparator(cardSorter.sort);
    return f.sort((a, b) => (a.side !== b.side && side === "all" ? (a.side === "long" ? -1 : 1) : cmp(a, b)));
  }, [all, side, rankedOnly, cardSorter.sort]);

  const rows = uni.data?.rows ?? [];
  const fno = useMemo(() => rows.filter((r) => r.fno_eligible), [rows]);
  const setupSymbols = useMemo(() => new Set(all.filter((c) => c.fno_eligible).map((c) => c.symbol)), [all]);
  const watch = useMemo(() => {
    const f = fno.filter((r) => !setupSymbols.has(r.symbol)).filter((r) => { const s = momentumSide(r); return s != null && (side === "all" || s === side); });
    return sortRows(f, tableSorter.sort.key, tableSorter.sort.dir);
  }, [fno, setupSymbols, side, tableSorter.sort]);

  if (!run.data) return <div className="space-y-3"><Skeleton h={90} /><Skeleton h={120} /><Skeleton h={300} /></div>;
  const r = run.data;
  const oc: Candidate | undefined = openCand ? all.find((c) => `${c.symbol}:${c.side}` === openCand) : undefined;
  const orow = openRow ? rows.find((x) => x.symbol === openRow) : undefined;
  const nUp = fno.filter((x) => momentumSide(x) === "long").length, nDown = fno.filter((x) => momentumSide(x) === "short").length;

  return (
    <div className="space-y-5">
      <section className="fade-in flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Optionable Swing Moves</h1>
          <p className="mt-1 text-sm text-muted">Only NSE F&amp;O stocks, where options and futures can express either direction. Horizon of the underlying rules: roughly one day to one month. Session {r.session_date}.</p>
        </div>
        <RefreshButton />
      </section>

      <section className="bento">
        <div className="tile tile-kpi col-span-2 md:col-span-3"><div className="flex items-center justify-between"><span className="label">Regime</span><IconLayers className="text-muted" /></div><div className="kpi"><RegimeBadge regime={r.regime.regime} /></div><div className="mt-1 text-[11px] text-muted">{fmtNum(fno.length)} F&amp;O names scanned</div></div>
        <div className="tile tile-kpi md:col-span-3"><div className="flex items-center justify-between"><span className="label">Full setups</span><IconBolt className="text-muted" /></div><div className="kpi">{setupSymbols.size}</div><div className="mt-1 text-[11px] text-muted">{all.filter((c) => c.fno_eligible && c.side === "long").length} long · {all.filter((c) => c.fno_eligible && c.side === "short").length} short</div></div>
        <div className="tile tile-kpi md:col-span-3"><div className="flex items-center justify-between"><span className="label">Upward momentum</span><IconTrendUp className="text-long" /></div><div className="kpi text-long">{nUp}</div><div className="mt-1 text-[11px] text-muted">Stage 2 · RS &gt; 0 · 20-bar &gt; 0</div></div>
        <div className="tile tile-kpi md:col-span-3"><div className="flex items-center justify-between"><span className="label">Downward momentum</span><IconTrendDown className="text-short" /></div><div className="kpi text-short">{nDown}</div><div className="mt-1 text-[11px] text-muted">Stage 4 · RS &lt; 0 · 20-bar &lt; 0</div></div>
      </section>

      {!r.ban_list.available && <Notice>F&amp;O ban list unavailable for this session: short setups could not be verified against it.</Notice>}

      <section className="card flex flex-wrap items-center gap-2">
        {(["all", "long", "short"] as const).map((s) => <Pill key={s} on={side === s} onClick={() => setSide(s)}>{s === "all" ? "Both directions" : s === "long" ? "Upward" : "Downward"}</Pill>)}
        <span className="mx-1 self-center text-white/10">|</span>
        <Pill on={rankedOnly} onClick={() => setRankedOnly(!rankedOnly)}>Ranked setups only</Pill>
        <span className="ml-auto" />
        <CardSortBar sort={cardSorter.sort} onToggle={cardSorter.toggle} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Full setups <span className="text-sm font-normal text-muted">— every scanner rule matched, levels available</span></h2>
        {cands.isLoading ? <Skeleton h={180} /> : setups.length === 0 ? (
          <Empty>No F&amp;O stock produced a complete setup this session{side !== "all" ? " in this direction" : ""}. The momentum screen below lists names where trend, relative strength and the 20-bar move still line up.</Empty>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {setups.map((c, i) => <SetupCard key={`${c.symbol}:${c.side}`} cand={c} selected={false} onOpen={() => setOpenCand(`${c.symbol}:${c.side}`)} index={i} />)}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Momentum screen <span className="text-sm font-normal text-muted">— F&amp;O names without a full setup, trend + RS + 20-bar move aligned ({watch.length})</span></h2>
        {!uni.data ? <Skeleton h={300} /> : watch.length === 0 ? <Empty>No F&amp;O stock passes the momentum screen{side !== "all" ? " in this direction" : ""}.</Empty> : <UniverseTable rows={watch} onOpen={(x) => setOpenRow(x.symbol)} sorter={tableSorter} />}
        <p className="text-[11px] text-muted">Momentum screen rows have no entry, stop or target: the scanner did not find a pullback or trigger pattern for them. Click any row for the reasoning behind its tag. Nothing here forecasts price movement.</p>
      </section>

      {oc && <SetupDetail cand={oc} onClose={() => setOpenCand(null)} />}
      {orow && <RowDetail row={orow} onClose={() => setOpenRow(null)} />}
    </div>
  );
}
