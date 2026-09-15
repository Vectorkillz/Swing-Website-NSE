import { useMemo, useState } from "react";
import { useLatestRun, useUniverse } from "../lib/dataClient";
import { fmtInr, fmtNum, fmtPct } from "../lib/format";
import type { CapBucket, UniverseRow } from "../lib/types";
import { CAP_LABEL, Empty, MultibaggerBadge, Skeleton } from "../components/ui";

type SortKey = "symbol" | "rs" | "mcap" | "atr" | "from_high" | "roc";
const CAPS: CapBucket[] = ["large", "mid", "small", "micro"];

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className="pill" aria-pressed={on} onClick={onClick}>{children}</button>;
}

export default function Universe() {
  const { runId, run } = useLatestRun();
  const uni = useUniverse(runId);
  const [q, setQ] = useState("");
  const [caps, setCaps] = useState<Set<CapBucket>>(new Set());
  const [stage, setStage] = useState<"all" | "stage2" | "stage4">("all");
  const [suitableOnly, setSuitableOnly] = useState(true);
  const [mbOnly, setMbOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("rs");
  const [sector, setSector] = useState("all");

  const rows = uni.data?.rows ?? [];
  const sectors = useMemo(() => Array.from(new Set(rows.map((r) => r.sector ?? "Unknown"))).sort(), [rows]);
  const list = useMemo(() => {
    const f = rows.filter((r) =>
      (!q || r.symbol.includes(q.toUpperCase()) || (r.name ?? "").toLowerCase().includes(q.toLowerCase())) &&
      (caps.size === 0 || caps.has(r.cap_bucket)) &&
      (stage === "all" || r.stage === stage) &&
      (!suitableOnly || r.swing_suitable) &&
      (!mbOnly || (r.multibagger && r.multibagger.level !== "none")) &&
      (sector === "all" || (r.sector ?? "Unknown") === sector),
    );
    const num = (x: number | null | undefined) => (x == null ? -Infinity : x);
    const s: Record<SortKey, (a: UniverseRow, b: UniverseRow) => number> = {
      symbol: (a, b) => a.symbol.localeCompare(b.symbol),
      rs: (a, b) => num(b.rs_vs_nifty) - num(a.rs_vs_nifty),
      mcap: (a, b) => num(b.market_cap_cr) - num(a.market_cap_cr),
      atr: (a, b) => num(b.context?.atr_pct) - num(a.context?.atr_pct),
      from_high: (a, b) => num(b.context?.pct_from_52w_high) - num(a.context?.pct_from_52w_high),
      roc: (a, b) => num(b.context?.roc_20) - num(a.context?.roc_20),
    };
    return [...f].sort(s[sort]);
  }, [rows, q, caps, stage, suitableOnly, mbOnly, sort, sector]);

  function toggleCap(c: CapBucket) { const n = new Set(caps); n.has(c) ? n.delete(c) : n.add(c); setCaps(n); }

  if (!run.data || !uni.data) return <div className="space-y-3"><Skeleton h={60} /><Skeleton h={400} /></div>;
  const counts = run.data.counts;

  return (
    <div className="space-y-4">
      <div className="fade-in">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">F&amp;O universe</h1>
        <p className="mt-1 text-sm text-muted">{counts.universe} stocks in the NSE F&amp;O list · {counts.swing_suitable} pass the swing tradability screen (liquidity and ATR range) · {counts.multibagger_strong} strong and {counts.multibagger_watch} watch multibagger tags · session {run.data.session_date}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input w-44" placeholder="Search symbol" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search symbol" />
        {CAPS.map((c) => <Pill key={c} on={caps.has(c)} onClick={() => toggleCap(c)}>{CAP_LABEL[c]}</Pill>)}
        <span className="mx-1 text-white/10">|</span>
        {(["all", "stage2", "stage4"] as const).map((s) => <Pill key={s} on={stage === s} onClick={() => setStage(s)}>{s === "all" ? "Any trend" : s === "stage2" ? "Stage 2 uptrend" : "Stage 4 downtrend"}</Pill>)}
        <span className="mx-1 text-white/10">|</span>
        <Pill on={suitableOnly} onClick={() => setSuitableOnly(!suitableOnly)}>Swing-tradable</Pill>
        <Pill on={mbOnly} onClick={() => setMbOnly(!mbOnly)}>✦ Multibagger</Pill>
        <select className="input" value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector"><option value="all">All sectors</option>{sectors.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select className="input" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort"><option value="rs">Sort: RS vs Nifty</option><option value="roc">Sort: 20-bar change</option><option value="from_high">Sort: near 52w high</option><option value="atr">Sort: ATR %</option><option value="mcap">Sort: market cap</option><option value="symbol">Sort: symbol</option></select>
        <span className="ml-auto text-xs text-muted">{list.length} shown</span>
      </div>
      {list.length === 0 ? <Empty>Nothing matches these filters.</Empty> : (
        <div className="card overflow-x-auto p-0">
          <table className="data">
            <thead><tr><th>Symbol</th><th>Cap</th><th>Trend</th><th className="text-right">Close</th><th className="text-right">RS vs Nifty</th><th className="text-right">20-bar</th><th className="text-right">From 52w high</th><th className="text-right">ATR %</th><th className="text-right hidden md:table-cell">Avg vol</th><th>Tags</th></tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.symbol}>
                  <td><div className="font-semibold">{r.symbol}</div><div className="text-[11px] text-muted">{r.sector ?? "—"}</div></td>
                  <td className="text-xs text-muted">{CAP_LABEL[r.cap_bucket]}</td>
                  <td><span className={`badge ${r.stage === "stage2" ? "bg-long/20 text-long" : r.stage === "stage4" ? "bg-short/20 text-short" : "bg-white/10 text-muted"}`}>{r.stage ?? "—"}</span></td>
                  <td className="mono text-right">{fmtInr(r.close)}</td>
                  <td className={`mono text-right ${(r.rs_vs_nifty ?? 0) >= 0 ? "text-long" : "text-short"}`}>{r.rs_vs_nifty == null ? "—" : `${r.rs_vs_nifty >= 0 ? "+" : ""}${r.rs_vs_nifty.toFixed(1)}`}</td>
                  <td className="mono text-right">{fmtPct(r.context?.roc_20)}</td>
                  <td className="mono text-right">{fmtPct(r.context?.pct_from_52w_high)}</td>
                  <td className="mono text-right">{fmtPct(r.context?.atr_pct)}</td>
                  <td className="mono text-right hidden md:table-cell">{fmtNum(r.context?.avg_volume_20)}</td>
                  <td className="space-x-1">
                    {r.setup_side && <span className={`badge ${r.setup_side === "long" ? "bg-long/20 text-long" : "bg-short/20 text-short"}`}>{r.setup_side} setup</span>}
                    {r.multibagger && <MultibaggerBadge level={r.multibagger.level} />}
                    {r.swing_suitable === false && <span className="badge bg-white/5 text-muted" title={r.swing_notes.join("; ")}>not swing-tradable</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-muted">Swing-tradable = average volume above the configured minimum and ATR between 1.5% and 8% of price. The multibagger tag is a trend-template checklist (Stage 2, above SMA150, 30%+ off the 52-week low, within 25% of the 52-week high, positive relative strength, not large cap; "strong" adds revenue or EPS growth). It is a heuristic, not a forecast.</p>
    </div>
  );
}
