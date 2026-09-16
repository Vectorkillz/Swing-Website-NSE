import { useMemo } from "react";
import { useOhlcv } from "../lib/dataClient";
import { fmtInr, fmtNum, fmtPct } from "../lib/format";
import { buildRowReasoning } from "../lib/reasoning";
import type { ChartPayload, UniverseRow } from "../lib/types";
import Drawer from "./Drawer";
import PriceChart from "./PriceChart";
import ReasoningPanel from "./Reasoning";
import { CapBadge, Empty, FnoBadge, MultibaggerBadge, Skeleton } from "./ui";

/** Detail drawer for a universe row that has no candidate record: reasoning from stored context + raw price history. */
export default function RowDetail({ row, onClose }: { row: UniverseRow; onClose: () => void }) {
  const bars = useOhlcv(row.symbol);
  const reasoning = useMemo(() => buildRowReasoning(row), [row]);
  const chart: ChartPayload | null = useMemo(() => {
    if (!bars.data || bars.data.length === 0) return null;
    const daily = bars.data.slice(-300).map((b) => ({ d: b.date, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, ema10: null, ema20: null, ema50: null, ema200: null, sma150: null, atr14: null, vol20: null }));
    return { symbol: row.symbol, as_of: row.last_bar_date, daily, weekly: [], annotations: {} };
  }, [bars.data, row.symbol, row.last_bar_date]);

  const title = (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-2xl font-bold tracking-tight">{row.symbol}</h2>
      <span className={`badge ${row.stage === "stage2" ? "bg-long/20 text-long" : row.stage === "stage4" ? "bg-short/20 text-short" : "bg-white/10 text-muted"}`}>{row.stage ?? "—"}</span>
      <CapBadge bucket={row.cap_bucket} />
      <FnoBadge eligible={row.fno_eligible} />
      {row.multibagger && <MultibaggerBadge level={row.multibagger.level} />}
      <span className="w-full text-sm text-muted sm:w-auto">{row.name ?? ""}{row.sector ? ` · ${row.sector}` : ""} · close {fmtInr(row.close)} on {row.last_bar_date ?? "—"}</span>
    </div>
  );

  return (
    <Drawer title={title} onClose={onClose} label={`${row.symbol} detail`}>
      <div className="space-y-4">
        <ReasoningPanel r={reasoning} />
        <div className="bento">
          <div className="tile tile-kpi md:col-span-3"><div className="label">RS vs Nifty</div><div className={`kpi ${(row.rs_vs_nifty ?? 0) >= 0 ? "text-long" : "text-short"}`}>{row.rs_vs_nifty == null ? "—" : `${row.rs_vs_nifty >= 0 ? "+" : ""}${row.rs_vs_nifty.toFixed(1)}`}</div></div>
          <div className="tile tile-kpi md:col-span-3"><div className="label">20-bar change</div><div className="kpi">{fmtPct(row.context?.roc_20)}</div></div>
          <div className="tile tile-kpi md:col-span-3"><div className="label">From 52w high</div><div className="kpi">{fmtPct(row.context?.pct_from_52w_high)}</div></div>
          <div className="tile tile-kpi md:col-span-3"><div className="label">ATR % · avg vol</div><div className="kpi text-xl md:text-2xl">{fmtPct(row.context?.atr_pct)} <span className="text-sm text-muted">· {fmtNum(row.context?.avg_volume_20)}</span></div></div>
        </div>
        {chart ? <PriceChart data={chart} height={340} /> : bars.isError ? <Empty>No price history file for {row.symbol}.</Empty> : <Skeleton h={340} />}
        <p className="text-[11px] text-muted">Raw daily bars only (indicator overlays are computed for scanner candidates). No setup levels exist for this symbol this session.</p>
      </div>
    </Drawer>
  );
}
