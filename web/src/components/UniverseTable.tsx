import { fmtInr, fmtNum, fmtPct } from "../lib/format";
import { chain, cmpBool, cmpNum, cmpStr, type SortState, type Sorter } from "../lib/sort";
import type { UniverseRow } from "../lib/types";
import SortTh from "./SortTh";
import StarButton from "./StarButton";
import { CAP_LABEL, FnoBadge, MultibaggerBadge } from "./ui";

export type UniKey = "symbol" | "cap" | "stage" | "close" | "roc" | "rs" | "volx" | "rsi" | "brk" | "from_high" | "atr" | "vol" | "hhhl";
export const UNI_DEFAULT_DIR: Record<UniKey, "asc" | "desc"> = { symbol: "asc", cap: "desc", stage: "asc", close: "desc", roc: "desc", rs: "desc", volx: "desc", rsi: "desc", brk: "desc", from_high: "desc", atr: "desc", vol: "desc", hhhl: "desc" };
const STAGE_ORDER = { stage2: 0, transition: 1, stage4: 2 };

function cmpFor(s: SortState<UniKey>): (a: UniverseRow, b: UniverseRow) => number {
  const d = s.dir;
  switch (s.key) {
    case "symbol": return (a, b) => cmpStr(a.symbol, b.symbol, d);
    case "cap": return (a, b) => cmpNum(a.market_cap_cr, b.market_cap_cr, d);
    case "stage": return (a, b) => cmpNum(a.stage ? STAGE_ORDER[a.stage] : null, b.stage ? STAGE_ORDER[b.stage] : null, d);
    case "close": return (a, b) => cmpNum(a.close, b.close, d);
    case "roc": return (a, b) => cmpNum(a.context?.roc_20, b.context?.roc_20, d);
    case "rs": return (a, b) => cmpNum(a.rs_vs_nifty, b.rs_vs_nifty, d);
    case "volx": return (a, b) => cmpNum(a.context?.vol_ratio_20, b.context?.vol_ratio_20, d);
    case "rsi": return (a, b) => cmpNum(a.context?.rsi14, b.context?.rsi14, d);
    case "brk": return (a, b) => cmpNum(a.context?.pct_from_20d_high, b.context?.pct_from_20d_high, d);
    case "from_high": return (a, b) => cmpNum(a.context?.pct_from_52w_high, b.context?.pct_from_52w_high, d);
    case "atr": return (a, b) => cmpNum(a.context?.atr_pct, b.context?.atr_pct, d);
    case "vol": return (a, b) => cmpNum(a.context?.avg_volume_20, b.context?.avg_volume_20, d);
    case "hhhl": return (a, b) => cmpBool(a.context?.higher_highs_lows, b.context?.higher_highs_lows, d);
  }
}

export function sortRows(rows: UniverseRow[], sorts: SortState<UniKey>[]): UniverseRow[] {
  const cmp = chain(...sorts.map(cmpFor), (a, b) => a.symbol.localeCompare(b.symbol));
  return [...rows].sort(cmp);
}

const signed = (x: number | null | undefined, digits = 1, suffix = "") => (x == null ? "—" : `${x >= 0 ? "+" : ""}${x.toFixed(digits)}${suffix}`);
const tone = (x: number | null | undefined) => (x == null ? "text-muted" : x >= 0 ? "text-long" : "text-short");

/**
 * Dense universe table: sticky header, sticky symbol column, multi-column sort (shift-click), star.
 * Screener columns (Vol×, RSI, 20d high, HH/HL) are blank for runs written before 2026-09-16.
 */
export default function UniverseTable({ rows, onOpen, sorter, dense = true, hideCols = [] }: { rows: UniverseRow[]; onOpen: (r: UniverseRow) => void; sorter: Sorter<UniKey>; dense?: boolean; hideCols?: UniKey[] }) {
  const hidden = new Set(hideCols);
  const th = (k: UniKey, label: string, right = false, cls = "", title?: string) => hidden.has(k) ? null : <SortTh key={k} k={k} label={label} ariaSort={sorter.ariaSort} onToggle={sorter.toggle} rank={sorter.rank} right={right} className={cls} title={title} />;
  return (
    <div className="table-wrap">
      <table className={`data ${dense ? "dense" : ""}`} data-testid="universe-table">
        <thead>
          <tr>
            <th className="sticky-col sortable" aria-sort={sorter.ariaSort("symbol")} scope="col"><button type="button" onClick={(e) => sorter.toggle("symbol", e.shiftKey)} title="Sort by symbol">Symbol</button></th>
            {th("cap", "Cap")}
            {th("stage", "Trend")}
            {th("close", "Close", true)}
            {th("roc", "Chg 20b", true, "", "Percent change over the last 20 sessions")}
            {th("rs", "RS", true, "", "Relative strength vs Nifty over 20 bars, percentage points")}
            {th("volx", "Vol ×", true, "", "Latest volume ÷ 20-day average volume")}
            {th("rsi", "RSI", true, "", "Wilder RSI(14)")}
            {th("brk", "vs 20d hi", true, "", "Close vs the highest high of the prior 20 sessions; positive = breakout above it")}
            {th("from_high", "52w hi", true, "hidden lg:table-cell", "Distance from the 52-week high")}
            {th("atr", "ATR %", true, "hidden md:table-cell")}
            {th("vol", "Avg vol", true, "hidden md:table-cell")}
            {th("hhhl", "HH/HL", false, "hidden lg:table-cell", "Higher highs and higher lows: last 20 sessions vs the 20 before")}
            <th scope="col">Tags</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const c = r.context;
            return (
              <tr key={r.symbol} className="row-link" onClick={() => onOpen(r)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(r); }} aria-label={`${r.symbol} detail`}>
                <td className="sticky-col">
                  <div className="flex items-center gap-1.5">
                    <StarButton symbol={r.symbol} />
                    <div><div className="font-semibold leading-tight">{r.symbol}</div><div className="max-w-[9rem] truncate text-[10px] text-muted">{r.name ?? r.sector ?? "—"}</div></div>
                  </div>
                </td>
                {!hidden.has("cap") && <td className="text-xs text-muted">{CAP_LABEL[r.cap_bucket]}</td>}
                {!hidden.has("stage") && <td><span className={`badge ${r.stage === "stage2" ? "bg-long/20 text-long" : r.stage === "stage4" ? "bg-short/20 text-short" : "bg-ink/10 text-muted"}`}>{r.stage ?? "—"}</span></td>}
                {!hidden.has("close") && <td className="mono text-right">{fmtInr(r.close)}</td>}
                {!hidden.has("roc") && <td className={`mono text-right ${tone(c?.roc_20)}`}>{signed(c?.roc_20, 1, "%")}</td>}
                {!hidden.has("rs") && <td className={`mono text-right ${tone(r.rs_vs_nifty)}`}>{signed(r.rs_vs_nifty)}</td>}
                {!hidden.has("volx") && <td className={`mono text-right ${c?.vol_ratio_20 != null && c.vol_ratio_20 >= 2 ? "text-warn font-semibold" : ""}`}>{c?.vol_ratio_20 == null ? "—" : `${c.vol_ratio_20.toFixed(1)}×`}</td>}
                {!hidden.has("rsi") && <td className={`mono text-right ${c?.rsi14 == null ? "text-muted" : c.rsi14 >= 70 ? "text-long" : c.rsi14 <= 30 ? "text-short" : ""}`}>{c?.rsi14 == null ? "—" : c.rsi14.toFixed(0)}</td>}
                {!hidden.has("brk") && <td className={`mono text-right ${c?.pct_from_20d_high != null && c.pct_from_20d_high >= 0 ? "text-long font-semibold" : ""}`}>{signed(c?.pct_from_20d_high, 1, "%")}</td>}
                {!hidden.has("from_high") && <td className="mono text-right hidden lg:table-cell">{fmtPct(c?.pct_from_52w_high)}</td>}
                {!hidden.has("atr") && <td className="mono text-right hidden md:table-cell">{fmtPct(c?.atr_pct)}</td>}
                {!hidden.has("vol") && <td className="mono text-right hidden md:table-cell">{fmtNum(c?.avg_volume_20)}</td>}
                {!hidden.has("hhhl") && <td className="hidden lg:table-cell">{c?.higher_highs_lows == null ? <span className="text-muted">—</span> : c.higher_highs_lows ? <span className="text-long">✓</span> : <span className="text-muted">·</span>}</td>}
                <td className="space-x-1">
                  {r.setup_side && <span className={`badge ${r.setup_side === "long" ? "bg-long/20 text-long" : "bg-short/20 text-short"}`}>{r.setup_side} setup</span>}
                  <FnoBadge eligible={r.fno_eligible} />
                  {r.multibagger && r.multibagger.level !== "none" && <MultibaggerBadge level={r.multibagger.level} />}
                  {r.swing_suitable === false && <span className="badge bg-ink/5 text-muted" title={r.swing_notes.join("; ")}>not swing-tradable</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function rowsToExport(rows: UniverseRow[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    symbol: r.symbol, name: r.name, sector: r.sector, cap: r.cap_bucket, market_cap_cr: r.market_cap_cr, fno_eligible: r.fno_eligible, close: r.close, last_bar_date: r.last_bar_date,
    stage: r.stage, rs_vs_nifty: r.rs_vs_nifty, roc_20: r.context?.roc_20, vol_ratio_20: r.context?.vol_ratio_20, rsi14: r.context?.rsi14, pct_from_20d_high: r.context?.pct_from_20d_high,
    pct_from_52w_high: r.context?.pct_from_52w_high, atr_pct: r.context?.atr_pct, avg_volume_20: r.context?.avg_volume_20, higher_highs_lows: r.context?.higher_highs_lows,
    swing_suitable: r.swing_suitable, multibagger: r.multibagger?.level, setup_side: r.setup_side,
  }));
}
