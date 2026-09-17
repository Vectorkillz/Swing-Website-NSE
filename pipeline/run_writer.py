"""Write a ScanResult to the static data contract (docs/data-contract.md)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

from engine import ENGINE_VERSION
from engine.canonical import dumps, dumps_pretty, to_jsonable
from engine.config import ScanConfig, config_hash
from engine.indicators import add_indicators, ema as _ema, resample_weekly, sma as _sma
from engine.types import Candidate, ScanResult

SCHEMA_VERSION = 2


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def run_status(res: ScanResult) -> str:
    if not res.scan_performed:
        return "no_scan_regime_unknown"
    if any(w.startswith("degraded") for w in res.warnings):
        return "degraded"
    if not res.ban_list_available:
        return "ban_list_unavailable"
    return "ok"


def make_run_id(session_date: str, config_version: str, input_hash: str) -> str:
    return f"{session_date}_{config_version}_{input_hash[:8]}"


def write_run(
    out_dir: Path, res: ScanResult, cfg: ScanConfig, config_version: str, input_hash: str,
    universe_meta: dict[str, Any], ban_meta: dict[str, Any], failures: list[dict[str, Any]], generated_at: str | None = None,
) -> str:
    run_id = make_run_id(res.session_date, config_version, input_hash)
    generated_at = generated_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    usable = res.counts.get("usable", 0)
    universe = res.counts.get("universe", 0) or 1
    run = {
        "schema_version": SCHEMA_VERSION,
        "run_id": run_id,
        "session_date": res.session_date,
        "generated_at": generated_at,
        "config_version": config_version,
        "config_hash": config_hash(cfg),
        "input_hash": input_hash,
        "engine_version": ENGINE_VERSION,
        "status": run_status(res),
        "scan_performed": res.scan_performed,
        "regime": to_jsonable(res.regime),
        "counts": res.counts,
        "coverage_pct": round(usable / universe * 100.0, 2),
        "ban_list": {"available": res.ban_list_available, **ban_meta},
        "universe": universe_meta,
        "warnings": list(res.warnings),
        "failures": failures,
        "cap_buckets": {"largecap_min_cr": cfg.largecap_min_cr, "midcap_min_cr": cfg.midcap_min_cr, "smallcap_min_cr": cfg.smallcap_min_cr},
    }
    run_dir = out_dir / run_id
    write_text(run_dir / "run.json", dumps_pretty(run))
    write_text(run_dir / "candidates.json", dumps_pretty({"schema_version": SCHEMA_VERSION, "run_id": run_id, "candidates": list(res.candidates)}))
    write_text(run_dir / "symbol_status.json", dumps({"schema_version": SCHEMA_VERSION, "run_id": run_id, "statuses": list(res.symbol_status)}))
    write_text(run_dir / "universe.json", dumps({"schema_version": SCHEMA_VERSION, "run_id": run_id, "rows": list(res.universe)}))
    return run_id


def update_index(runs_dir: Path, keep: int) -> None:
    entries = []
    for run_json in sorted(runs_dir.glob("*/run.json")):
        r = json.loads(run_json.read_text(encoding="utf-8"))
        entries.append({
            "run_id": r["run_id"], "session_date": r["session_date"], "generated_at": r["generated_at"], "regime": r["regime"]["regime"],
            "status": r["status"], "config_version": r["config_version"], "n_longs": r["counts"].get("ranked_long", 0),
            "n_shorts": r["counts"].get("ranked_short", 0), "coverage_pct": r["coverage_pct"],
        })
    entries.sort(key=lambda e: (e["session_date"], e["generated_at"]), reverse=True)
    for stale in entries[keep:]:
        d = runs_dir / stale["run_id"]
        for f in d.glob("*"):
            f.unlink()
        d.rmdir()
    entries = entries[:keep]
    write_text(runs_dir / "index.json", dumps_pretty({"schema_version": SCHEMA_VERSION, "runs": entries}))
    if entries:
        write_text(runs_dir / "latest.json", dumps_pretty({"schema_version": SCHEMA_VERSION, "run_id": entries[0]["run_id"]}))


def chart_payload(symbol: str, daily: pd.DataFrame, cand: Candidate | None, cfg: ScanConfig) -> dict[str, Any]:
    d = add_indicators(daily)
    tail = d.iloc[-cfg.chart_bars :]
    bars = [
        {
            "d": pd.Timestamp(ts).strftime("%Y-%m-%d"), "o": row["open"], "h": row["high"], "l": row["low"], "c": row["close"], "v": row["volume"],
            "ema10": row["ema10"], "ema20": row["ema20"], "ema50": row["ema50"], "ema200": row["ema200"], "sma150": row["sma150"], "atr14": row["atr14"], "vol20": row["vol20"], "rsi14": row.get("rsi14"),
        }
        for ts, row in tail.iterrows()
    ]
    weekly = resample_weekly(daily)
    wk = []
    if not weekly.empty:
        we = _ema(weekly["close"], cfg.trail_ema_weeks)
        ws = _sma(weekly["close"], cfg.trail_sma_weeks)
        for i, (ts, row) in enumerate(weekly.iterrows()):
            wk.append({"d": pd.Timestamp(ts).strftime("%Y-%m-%d"), "c": row["close"], "ema": we.iloc[i], "sma": ws.iloc[i]})
    ann: dict[str, Any] = {}
    if cand is not None:
        if cand.leg is not None and cand.leg.start_date:
            ann["leg"] = {"start": cand.leg.start_date, "end": cand.leg.end_date, "high": cand.leg.leg_high, "mean_volume": cand.leg.leg_mean_volume}
        if cand.vcp is not None:
            ann["vcp_depth_pct"] = cand.vcp.depth_pct
            ann["recent_mean_volume"] = cand.vcp.recent_mean_volume
        if cand.bar_pattern is not None and cand.bar_pattern.kind:
            ann["trigger"] = cand.bar_pattern.trigger
            ann["trigger_kind"] = cand.bar_pattern.kind
        if cand.plan is not None:
            ann["entry"] = cand.plan.entry
            ann["entry_max"] = cand.plan.entry_max
            ann["stop"] = cand.plan.stop
            ann["target"] = cand.plan.target
            ann["extended_target"] = cand.plan.extended_target
    return {"schema_version": SCHEMA_VERSION, "symbol": symbol, "as_of": bars[-1]["d"] if bars else None, "daily": bars, "weekly": wk[-160:], "annotations": ann}
