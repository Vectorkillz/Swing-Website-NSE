import { useEffect, useRef } from "react";
import { ColorType, CrosshairMode, LineStyle, createChart, type IChartApi, type Time } from "lightweight-charts";
import type { ChartPayload } from "../lib/types";

const COLORS = { ema10: "#f5b544", ema20: "#6ea8fe", ema50: "#c084fc", ema200: "#ff5d7a", sma150: "#8b95a7" };

export default function PriceChart({ data, height = 360 }: { data: ChartPayload; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = createChart(el, {
      height,
      layout: { background: { type: ColorType.Solid, color: "#141a23" }, textColor: "#8b95a7", fontFamily: "Inter, system-ui, sans-serif" },
      grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.06)", scaleMargins: { top: 0.05, bottom: 0.28 } },
      timeScale: { borderColor: "rgba(255,255,255,0.06)", rightOffset: 4 },
      autoSize: true,
    });
    chartRef.current = chart;
    const candles = chart.addCandlestickSeries({ upColor: "#1db954", downColor: "#ff5d7a", borderVisible: false, wickUpColor: "#1db954", wickDownColor: "#ff5d7a" });
    candles.setData(data.daily.map((b) => ({ time: b.d as Time, open: b.o, high: b.h, low: b.l, close: b.c })));

    for (const [key, title] of [["ema10", "EMA10"], ["ema20", "EMA20"], ["ema50", "EMA50"], ["ema200", "EMA200"], ["sma150", "SMA150"]] as [keyof typeof COLORS, string][]) {
      const s = chart.addLineSeries({ color: COLORS[key], lineWidth: 1, title, priceLineVisible: false, lastValueVisible: false, lineStyle: key === "sma150" ? LineStyle.Dashed : LineStyle.Solid });
      s.setData(data.daily.filter((b) => b[key] != null).map((b) => ({ time: b.d as Time, value: b[key] as number })));
    }
    const leg = data.annotations.leg;
    if (leg) {
      const area = chart.addAreaSeries({ lineColor: "rgba(110,168,254,0.6)", topColor: "rgba(110,168,254,0.18)", bottomColor: "rgba(110,168,254,0.02)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: "Momentum leg" });
      area.setData(data.daily.filter((b) => b.d >= leg.start && b.d <= leg.end).map((b) => ({ time: b.d as Time, value: leg.high })));
    }
    const a = data.annotations;
    const lines: [number | null | undefined, string, string, LineStyle][] = [
      [a.trigger, `Trigger (${a.trigger_kind ?? ""})`, "#f5b544", LineStyle.Dashed],
      [a.entry, "Entry", "#1db954", LineStyle.Dashed],
      [a.entry_max, "Entry max", "#1db954", LineStyle.Dotted],
      [a.stop, "Stop", "#ff5d7a", LineStyle.Dashed],
      [a.target, "Target", "#6ea8fe", LineStyle.Dashed],
      [a.extended_target, "Extended target", "#6ea8fe", LineStyle.Dotted],
    ];
    for (const [price, title, color, style] of lines) {
      if (price == null) continue;
      candles.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title });
    }
    const vol = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.78, bottom: 0 }, borderColor: "rgba(255,255,255,0.06)" });
    vol.setData(data.daily.map((b) => ({ time: b.d as Time, value: b.v, color: b.c >= b.o ? "rgba(29,185,84,0.45)" : "rgba(255,93,122,0.45)" })));
    const vol20 = chart.addLineSeries({ priceScaleId: "vol", color: "#8b95a7", lineWidth: 1, lastValueVisible: false, priceLineVisible: false, title: "Vol20" });
    vol20.setData(data.daily.filter((b) => b.vol20 != null).map((b) => ({ time: b.d as Time, value: b.vol20 as number })));
    if (leg?.mean_volume != null) vol.createPriceLine({ price: leg.mean_volume, color: "#6ea8fe", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "Leg mean volume" });
    if (a.recent_mean_volume != null) vol.createPriceLine({ price: a.recent_mean_volume, color: "#f5b544", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "10-bar mean volume" });
    const last = data.daily.length;
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, last - 130), to: last + 3 });
    return () => { chart.remove(); chartRef.current = null; };
  }, [data, height]);

  return (
    <div>
      <div ref={ref} className="w-full overflow-hidden rounded-xl" style={{ height }} role="img" aria-label={`Price chart for ${data.symbol}`} />
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted">
        {Object.entries(COLORS).map(([k, c]) => <span key={k}><span className="inline-block h-1.5 w-3 rounded align-middle" style={{ background: c }} /> {k.toUpperCase()}</span>)}
        <span><span className="inline-block h-1.5 w-3 rounded bg-blue/40 align-middle" /> momentum leg</span>
        <span className="text-long">— entry</span><span className="text-short">— stop</span><span className="text-blue">— target</span>
      </div>
    </div>
  );
}
