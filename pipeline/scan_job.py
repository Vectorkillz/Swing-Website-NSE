"""Assemble ScanInputs from the repo data directory, run the engine, write the contract."""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Optional

import pandas as pd

from engine.canonical import dumps_pretty, snapshot_hash
from engine.config import ScanConfig, config_hash
from engine.scan import scan_universe
from engine.types import ScanInputs, ScanResult, SymbolInput
from ingestion.csv_providers import CsvBanListProvider, CsvUniverseProvider
from ingestion.protocols import BanListSnapshot, UniverseSnapshot
from ingestion.store import FundamentalsStore, OhlcvStore
from pipeline import paths
from pipeline.run_writer import chart_payload, update_index, write_run, write_text


def compute_input_hash(inputs: ScanInputs, cfg: ScanConfig) -> str:
    frames = {s.symbol: s.daily for s in inputs.symbols}
    frames["__NIFTY__"] = inputs.nifty_daily
    frames["__SMALLCAP__"] = inputs.smallcap_daily
    extra = {
        "vix": inputs.vix_close,
        "ban_list": sorted(inputs.ban_list) if inputs.ban_list is not None else None,
        "fundamentals": {s.symbol: s.fundamentals for s in inputs.symbols},
        "config_hash": config_hash(cfg),
        "session": inputs.session_date.isoformat(),
    }
    return snapshot_hash(frames, extra)


def execute_scan(
    inputs: ScanInputs,
    cfg: ScanConfig,
    version: str,
    universe_meta: dict[str, Any],
    ban_meta: dict[str, Any],
    failures: list[dict[str, Any]],
    runs_dir: Path,
    charts_dir: Path,
    generated_at: Optional[str] = None,
) -> tuple[str, ScanResult]:
    input_hash = compute_input_hash(inputs, cfg)
    res = scan_universe(inputs, cfg)
    run_id = write_run(runs_dir, res, cfg, version, input_hash, universe_meta, ban_meta, failures, generated_at=generated_at)
    update_index(runs_dir, cfg.keep_runs)
    frames = {s.symbol: s.daily for s in inputs.symbols}
    seen: set[str] = set()
    for c in res.candidates:
        if c.symbol in seen:
            continue
        seen.add(c.symbol)
        daily = frames.get(c.symbol)
        if daily is not None:
            write_text(charts_dir / f"{c.symbol}.json", dumps_pretty(chart_payload(c.symbol, daily, c, cfg)))
    return run_id, res


def build_inputs_from_repo(
    session: date,
    universe: UniverseSnapshot,
    ban: Optional[BanListSnapshot],
    daily_store: OhlcvStore,
    index_store: OhlcvStore,
    fundamentals: FundamentalsStore,
) -> tuple[ScanInputs, list[dict[str, Any]]]:
    failures: list[dict[str, Any]] = []
    symbols = []
    for row in sorted(universe.rows, key=lambda r: r.symbol):
        try:
            daily = daily_store.load(row.symbol)
        except (ValueError, KeyError, OSError) as exc:
            failures.append({"symbol": row.symbol, "stage": "load_ohlcv", "error": f"{type(exc).__name__}: {exc}"})
            daily = None
        symbols.append(SymbolInput(row.symbol, daily, fundamentals.load(row.symbol), sector=row.sector, name=row.name))
    nifty = index_store.load("NIFTY")
    vix_df = index_store.load("INDIAVIX")
    vix = None
    if vix_df is not None and len(vix_df) and pd.Timestamp(vix_df.index[-1]).date() >= session - pd.Timedelta(days=5).to_pytimedelta():
        vix = float(vix_df["close"].iloc[-1])
    smallcap = index_store.load("SMALLCAP")
    inputs = ScanInputs(session, tuple(symbols), nifty, vix, smallcap, ban.symbols if ban else None, universe_size=len(symbols))
    return inputs, failures


def universe_meta(snap: UniverseSnapshot, cfg: ScanConfig, today: date) -> dict[str, Any]:
    age = (today - snap.as_of).days
    return {"source": snap.source, "as_of": snap.as_of.isoformat(), "n_symbols": len(snap.symbols), "age_days": age, "stale": age > cfg.universe_stale_days}


def ban_meta(snap: Optional[BanListSnapshot], live_error: Optional[str]) -> dict[str, Any]:
    if snap is None:
        return {"source": None, "as_of": None, "n": 0, "fetch_status": "failed", "live_error": live_error}
    return {"source": snap.source, "as_of": snap.as_of.isoformat(), "n": len(snap.symbols), "fetch_status": snap.fetch_status, "live_error": live_error}
