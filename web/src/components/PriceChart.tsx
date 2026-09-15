import { useEffect, useRef } from "react";
import { ColorType, CrosshairMode, LineStyle, createChart, type IChartApi, type ISeriesApi, type Time } from "lightweight-charts";
import type { ChartPayload } from "../lib/types";

const COLORS = { ema10: "#f5b544", ema20: "#6ea8fe", ema50: "#c084fc", ema200: "#ff5d7a", sma150: "#8b95a7" };

interface Props {
  data: ChartPayload;
  height?: number;
}

/** Candles + EMA10/20/50/200 + SMA150, momentum leg shaded, trigger/entry/stop lines, volume pane with leg and 10-bar averages. */
export default function PriceChart({ data, height = 380 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = createChart(el, {
      height,
      layout: { background: { type: ColorType.Solid, color: "#121722" }, textColor: "#8b95a7", fontFamily: "Inter, system-ui, sans-serif" },
      grid: { vertLines: { color: "#1f2733" }, horzLines: { color: "#1f2733" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#1f2733", scaleMargins: { top: 0.05, bottom: 0.3 } },
      timeScale: { borderColor: "#1f2733", rightOffset: 4 },
      autoSize: true,
    });
    chartRef.current = chart;

    const candles = chart.addCandlestickSeries({ upColor: "#2dd4a0", downColor: "#ff5d7a", borderVisible: false, wickUpColor: "#2dd4a0", wickDownColor: "#ff5d7a" });
    candles.setData(data.daily.map((b) => ({ time: b.d as Time, open: b.o, high: b.h, low: b.l, close: b.c })));

    const overlays: [keyof typeof COLORS, string][] = [["ema10", "EMA10"], ["ema20", "EMA20"], ["ema50", "EMA50"], ["ema200", "EMA200"], ["sma150", "SMA150"]];
    for (const [key, title] of overlays) {
      const s = chart.addLineSeries({ color: COLORS[key], lineWidth: 1, title, priceLineVisible: false, lastValueVisible: false, lineStyle: key === "sma150" ? LineStyle.Dashed : LineStyle.Solid });
      s.setData(data.daily.filter((b) => b[key] != null).map((b) => ({ time: b.d as Time, value: b[key] as number })));
    }

    // momentum leg shading: an area series spanning the leg window at the leg high
    const leg = data.annotations.leg;
    if (leg) {
      const area = chart.addAreaSeries({ lineColor: "rgba(110,168,254,0.6)", topColor: "rgba(110,168,254,0.18)", bottomColor: "rgba(110,168,254,0.02)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: "Momentum leg" });
      area.setData(data.daily.filter((b) => b.d >= leg.start && b.d <= leg.end).map((b) => ({ time: b.d as Time, value: leg.high })));
    }

    const lines: [number | null | undefined, string, string][] = [
      [data.annotations.trigger, `Trigger (${data.annotations.trigger_kind ?? ""})`, "#f5b544"],
      [data.annotations.entry, "Entry", "#2dd4a0"],
      [data.annotations.entry_max, "Entry max (do not chase)", "#2dd4a0"],
      [data.annotations.stop, "Stop", "#ff5d7a"],
    ];
    for (const [price, title, color] of lines) {
      if (price == null) continue;
      candles.createPriceLine({ price, color, lineWidth: 1, lineStyle: title.startsWith("Entry max") ? LineStyle.Dotted : LineStyle.Dashed, axisLabelVisible: true, title });
    }

    // volume pane
    const vol: ISeriesApi<"Histogram"> = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.75, bottom: 0 }, borderColor: "#1f2733" });
    vol.setData(data.daily.map((b) => ({ time: b.d as Time, value: b.v, color: b.c >= b.o ? "rgba(45,212,160,0.5)" : "rgba(255,93,122,0.5)" })));
    const vol20 = chart.addLineSeries({ priceScaleId: "vol", color: "#8b95a7", lineWidth: 1, lastValueVisible: false, priceLineVisible: false, title: "Vol20" });
    vol20.setData(data.daily.filter((b) => b.vol20 != null).map((b) => ({ time: b.d as Time, value: b.vol20 as number })));
    if (leg?.mean_volume != null) {
      vol.createPriceLine({ price: leg.mean_volume, color: "#6ea8fe", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "Leg mean volume" });
    }
    if (data.annotations.recent_mean_volume != null) {
      vol.createPriceLine({ price: data.annotations.recent_mean_volume, color: "#f5b544", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "10-bar mean volume" });
    }

    const last = data.daily.length;
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, last - 130), to: last + 3 });

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [data, height]);

  return (
    <div>
      <div ref={ref} className="w-full" style={{ height }} role="img" aria-label={`Price chart for ${data.symbol}`} />
      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted">
        {Object.entries(COLORS).map(([k, c]) => (
          <span key={k}><span className="inline-block h-2 w-3 align-middle" style={{ background: c }} /> {k.toUpperCase()}</span>
        ))}
        <span><span className="inline-block h-2 w-3 bg-accent/40 align-middle" /> momentum leg</span>
        <span className="text-warn">— trigger</span>
        <span className="text-long">— entry</span>
        <span className="text-short">— stop</span>
      </div>
    </div>
  );
}
