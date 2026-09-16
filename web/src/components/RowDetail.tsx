import { useMemo } from "react";
import { useOhlcv } from "../lib/dataClient";
import { fmtInr, fmtNum, fmtPct } from "../lib/format";
import { buildRowReasoning } from "../lib/reasoning";
import type { ChartPayload, UniverseRow } from "../lib/types";
import Drawer from "./Drawer";
import PriceChart from "./PriceChart";
import ReasoningPanel from "./Reasoning";
import StarButton from "./StarButton";
import { CapBadge, Empty, FnoBadge, MultibaggerBadge, Skeleton } from "./ui";

/** Detail drawer for a universe row that has no candidate record: reasoning from stored context + raw price history. */
export default function RowDetail({ row, onClose }: { row: UniverseRow; onClose: () => void }) {
  const bars = useOhlcv(row.symbol);
  const reasoning = useMemo(() => buildRowReasoning(row), [row]);
  const chart: ChartPayload | null = useMemo(() => {
    if (!bars.data || bars.data.length === 0) return null;
    const daily = bars.data.slice(-320).map((b) => ({ d: b.date, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, ema10: null, ema20: null, ema50: null, ema200: null, sma150: null, atr14: null, vol20: null, rsi14: null }));
    return { symbol: row.symbol, as_of: row.last_bar_date, daily, weekly: [], annotations: {} };
  }, [bars.data, row.symbol, row.last_bar_date]);
  const ctx = row.context;

  const title = (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-2xl font-bold tracking-tight">{row.symbol}</h2>
      <StarButton symbol={row.symbol} size={18} />
      <span className={`badge ${row.stage === "stage2" ? "bg-long/20 text-long" : row.stage === "stage4" ? "bg-short/20 text-short" : "bg-ink/10 text-muted"}`}>{row.stage ?? "—"}</span>
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
          <div className="tile tile-kpi md:col-span-3"><div className="label">20-bar change</div><div className={`kpi ${(ctx?.roc_20 ?? 0) >= 0 ? "text-long" : "text-short"}`}>{fmtPct(ctx?.roc_20)}</div></div>
          <div className="tile tile-kpi md:col-span-3"><div className="label">RSI 14 · Vol × avg</div><div className="kpi text-xl md:text-2xl">{ctx?.rsi14 == null ? "—" : ctx.rsi14.toFixed(0)} <span className="text-sm text-muted">· {ctx?.vol_ratio_20 == null ? "—" : `${ctx.vol_ratio_20.toFixed(1)}×`}</span></div></div>
          <div className="tile tile-kpi md:col-span-3"><div className="label">From 52w high · ATR %</div><div className="kpi text-xl md:text-2xl">{fmtPct(ctx?.pct_from_52w_high)} <span className="text-sm text-muted">· {fmtPct(ctx?.atr_pct)}</span></div></div>
        </div>
        {chart ? <PriceChart data={chart} height={340} /> : bars.isError ? <Empty>No price history file for {row.symbol}.</Empty> : <Skeleton h={340} />}
        <div className="card grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <h3 className="text-sm font-semibold sm:col-span-2">Key figures</h3>
          <div className="flex justify-between"><span className="text-muted">Market cap</span><span className="mono">{row.market_cap_cr == null ? "—" : `${fmtNum(row.market_cap_cr, 0)} Cr`}</span></div>
          <div className="flex justify-between"><span className="text-muted">Avg volume (20)</span><span className="mono">{fmtNum(ctx?.avg_volume_20)}</span></div>
          <div className="flex justify-between"><span className="text-muted">52-week range</span><span className="mono">{fmtInr(ctx?.low_52w)} – {fmtInr(ctx?.high_52w)}</span></div>
          <div className="flex justify-between"><span className="text-muted">vs prior 20-day high</span><span className="mono">{fmtPct(ctx?.pct_from_20d_high)}</span></div>
          <div className="flex justify-between"><span className="text-muted">Distance to EMA20 / EMA50</span><span className="mono">{fmtPct(ctx?.dist_ema20_pct)} / {fmtPct(ctx?.dist_ema50_pct)}</span></div>
          <div className="flex justify-between"><span className="text-muted">Higher highs & lows (20 vs prior 20)</span><span className="mono">{ctx?.higher_highs_lows == null ? "—" : ctx.higher_highs_lows ? "yes" : "no"}</span></div>
        </div>
        <p className="text-[11px] text-muted">Overlays on this chart are computed in the browser from the committed daily bars. No setup levels exist for this symbol this session. Fundamentals beyond market cap are only stored for scanner candidates.</p>
      </div>
    </Drawer>
  );
}
