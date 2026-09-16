import { useEffect, useMemo, useRef, useState } from "react";
import { ColorType, CrosshairMode, LineStyle, createChart, type IChartApi, type LogicalRange, type Time } from "lightweight-charts";
import { anchoredVwap, ema, rsiWilder } from "../lib/indicators";
import type { ChartPayload } from "../lib/types";

const COLORS = { ema20: "#6ea8fe", ema50: "#c084fc", ema200: "#ff334b", sma150: "#8e93a3", vwap: "#f5b544" };
const UP = "#00e676", DOWN = "#ff334b";
type Overlay = "ema20" | "ema50" | "ema200" | "sma150" | "vwap" | "rsi";
const DEFAULT_ON: Record<Overlay, boolean> = { ema20: true, ema50: true, ema200: true, sma150: false, vwap: false, rsi: true };

function cssVar(name: string, fallback: string): string {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; } catch { return fallback; }
}

/**
 * Candlestick chart with EMA 20/50/200 (+ SMA150), anchored VWAP, volume pane and a synced RSI(14) pane.
 * Indicator series missing from the payload (raw-bars charts) are computed client-side with the same
 * definitions as the engine.
 */
export default function PriceChart({ data, height = 360, anchorIdx }: { data: ChartPayload; height?: number; anchorIdx?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const rsiRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [on, setOn] = useState<Record<Overlay, boolean>>(() => {
    try { const s = localStorage.getItem("nse-swing.chart.overlays"); return s ? { ...DEFAULT_ON, ...JSON.parse(s) } : DEFAULT_ON; } catch { return DEFAULT_ON; }
  });
  useEffect(() => { try { localStorage.setItem("nse-swing.chart.overlays", JSON.stringify(on)); } catch { /* ignore */ } }, [on]);

  // Fill indicator series when the payload lacks them.
  const series = useMemo(() => {
    const closes = data.daily.map((b) => b.c);
    const has = (k: "ema20" | "ema50" | "ema200" | "sma150" | "rsi14") => data.daily.some((b) => b[k] != null);
    const e20 = has("ema20") ? data.daily.map((b) => b.ema20) : ema(closes, 20);
    const e50 = has("ema50") ? data.daily.map((b) => b.ema50) : ema(closes, 50);
    const e200 = has("ema200") ? data.daily.map((b) => b.ema200) : ema(closes, 200);
    const s150 = has("sma150") ? data.daily.map((b) => b.sma150) : closes.map((_, i) => (i >= 149 ? closes.slice(i - 149, i + 1).reduce((a, b) => a + b, 0) / 150 : null));
    const rsi = has("rsi14") ? data.daily.map((b) => b.rsi14 ?? null) : rsiWilder(closes, 14);
    const legStart = data.annotations.leg?.start;
    const anchor = anchorIdx ?? (legStart ? Math.max(0, data.daily.findIndex((b) => b.d >= legStart)) : Math.max(0, data.daily.length - 60));
    const vwap = anchoredVwap(data.daily, anchor);
    return { e20, e50, e200, s150, rsi, vwap, anchor, computed: !has("ema20") };
  }, [data, anchorIdx]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const bg = cssVar("--chart-bg", "#17171d"), text = cssVar("--chart-text", "#8e93a3"), grid = cssVar("--chart-grid", "rgba(255,255,255,0.04)"), border = cssVar("--chart-border", "rgba(255,255,255,0.06)");
    const base = {
      layout: { background: { type: ColorType.Solid, color: bg }, textColor: text, fontFamily: "Inter, system-ui, sans-serif" },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, rightOffset: 4 },
      autoSize: true,
    };
    const chart = createChart(el, { ...base, height, rightPriceScale: { ...base.rightPriceScale, scaleMargins: { top: 0.05, bottom: 0.28 } } });
    chartRef.current = chart;
    const t = (b: { d: string }) => b.d as Time;
    const candles = chart.addCandlestickSeries({ upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN });
    candles.setData(data.daily.map((b) => ({ time: t(b), open: b.o, high: b.h, low: b.l, close: b.c })));

    const line = (vals: (number | null)[], color: string, title: string, style = LineStyle.Solid) => {
      const s = chart.addLineSeries({ color, lineWidth: 1, title, priceLineVisible: false, lastValueVisible: false, lineStyle: style });
      s.setData(data.daily.map((b, i) => ({ time: t(b), value: vals[i] })).filter((p): p is { time: Time; value: number } => p.value != null));
    };
    if (on.ema20) line(series.e20, COLORS.ema20, "EMA20");
    if (on.ema50) line(series.e50, COLORS.ema50, "EMA50");
    if (on.ema200) line(series.e200, COLORS.ema200, "EMA200");
    if (on.sma150) line(series.s150, COLORS.sma150, "SMA150", LineStyle.Dashed);
    if (on.vwap) line(series.vwap, COLORS.vwap, "AVWAP", LineStyle.Dotted);

    const leg = data.annotations.leg;
    if (leg) {
      const area = chart.addAreaSeries({ lineColor: "rgba(110,168,254,0.6)", topColor: "rgba(110,168,254,0.18)", bottomColor: "rgba(110,168,254,0.02)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: "Momentum leg" });
      area.setData(data.daily.filter((b) => b.d >= leg.start && b.d <= leg.end).map((b) => ({ time: t(b), value: leg.high })));
    }
    const a = data.annotations;
    const lines: [number | null | undefined, string, string, LineStyle][] = [
      [a.trigger, `Trigger (${a.trigger_kind ?? ""})`, "#f5b544", LineStyle.Dashed],
      [a.entry, "Entry", UP, LineStyle.Dashed],
      [a.entry_max, "Entry max", UP, LineStyle.Dotted],
      [a.stop, "Stop", DOWN, LineStyle.Dashed],
      [a.target, "Target", "#6ea8fe", LineStyle.Dashed],
      [a.extended_target, "Extended target", "#6ea8fe", LineStyle.Dotted],
    ];
    for (const [price, title, color, style] of lines) {
      if (price == null) continue;
      candles.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title });
    }
    const vol = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.78, bottom: 0 }, borderColor: border });
    vol.setData(data.daily.map((b) => ({ time: t(b), value: b.v, color: b.c >= b.o ? "rgba(0,230,118,0.4)" : "rgba(255,51,75,0.4)" })));
    const vol20 = chart.addLineSeries({ priceScaleId: "vol", color: text, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, title: "Vol20" });
    vol20.setData(data.daily.filter((b) => b.vol20 != null).map((b) => ({ time: t(b), value: b.vol20 as number })));
    if (leg?.mean_volume != null) vol.createPriceLine({ price: leg.mean_volume, color: "#6ea8fe", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "Leg mean volume" });
    if (a.recent_mean_volume != null) vol.createPriceLine({ price: a.recent_mean_volume, color: "#f5b544", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "10-bar mean volume" });

    // RSI pane, time-scale synced both ways.
    let rsiChart: IChartApi | null = null;
    if (on.rsi && rsiRef.current) {
      rsiChart = createChart(rsiRef.current, { ...base, height: 110, rightPriceScale: { ...base.rightPriceScale, scaleMargins: { top: 0.1, bottom: 0.1 } }, timeScale: { ...base.timeScale, visible: false } });
      const rs = rsiChart.addLineSeries({ color: "#c084fc", lineWidth: 1, priceLineVisible: false, lastValueVisible: true, title: "RSI 14", autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });
      rs.setData(data.daily.map((b, i) => ({ time: t(b), value: series.rsi[i] })).filter((p): p is { time: Time; value: number } => p.value != null));
      for (const [lvl, c] of [[70, DOWN], [50, text], [30, UP]] as [number, string][]) rs.createPriceLine({ price: lvl, color: c, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });
      let syncing = false;
      const sync = (to: IChartApi) => (r: LogicalRange | null) => { if (!r || syncing) return; syncing = true; to.timeScale().setVisibleLogicalRange(r); syncing = false; };
      chart.timeScale().subscribeVisibleLogicalRangeChange(sync(rsiChart));
      rsiChart.timeScale().subscribeVisibleLogicalRangeChange(sync(chart));
    }

    const last = data.daily.length;
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, last - 130), to: last + 3 });
    return () => { chart.remove(); rsiChart?.remove(); chartRef.current = null; };
  }, [data, height, on, series]);

  const Toggle = ({ k, label, color }: { k: Overlay; label: string; color?: string }) => (
    <button type="button" className="pill pill-sm" aria-pressed={on[k]} onClick={() => setOn({ ...on, [k]: !on[k] })}>
      {color && <span className="inline-block h-1.5 w-3 rounded" style={{ background: color, opacity: on[k] ? 1 : 0.35 }} />}{label}
    </button>
  );

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Chart overlays">
        <Toggle k="ema20" label="EMA 20" color={COLORS.ema20} /><Toggle k="ema50" label="EMA 50" color={COLORS.ema50} /><Toggle k="ema200" label="EMA 200" color={COLORS.ema200} /><Toggle k="sma150" label="SMA 150" color={COLORS.sma150} />
        <Toggle k="vwap" label={`AVWAP from ${data.daily[series.anchor]?.d ?? "start"}`} color={COLORS.vwap} /><Toggle k="rsi" label="RSI 14" />
        {series.computed && <span className="text-[11px] text-muted">indicators computed in-browser from raw bars</span>}
      </div>
      <div ref={ref} className="w-full overflow-hidden rounded-xl" style={{ height }} role="img" aria-label={`Price chart for ${data.symbol}`} />
      {on.rsi && <div ref={rsiRef} className="mt-1 w-full overflow-hidden rounded-xl" style={{ height: 110 }} role="img" aria-label={`RSI 14 for ${data.symbol}`} />}
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted">
        {data.annotations.leg && <span><span className="inline-block h-1.5 w-3 rounded bg-blue/40 align-middle" /> momentum leg</span>}
        {data.annotations.entry != null && <><span className="text-long">— entry</span><span className="text-short">— stop</span><span className="text-blue">— target</span></>}
        <span>Anchored VWAP is Σ(typical price × volume) from the anchor bar on daily data, not an intraday VWAP.</span>
      </div>
    </div>
  );
}
