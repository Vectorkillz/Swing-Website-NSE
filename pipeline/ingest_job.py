"""Delta ingestion of daily OHLCV for the universe and the three indices."""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Iterable

from engine.config import ScanConfig
from ingestion.protocols import OhlcvProvider
from ingestion.store import OhlcvStore
from ingestion.symbols import INDEX_TICKERS
from pipeline.job_log import JobLog

log = logging.getLogger(__name__)


def ingest(
    symbols: Iterable[str],
    as_of: date,
    cfg: ScanConfig,
    provider: OhlcvProvider,
    daily_store: OhlcvStore,
    index_store: OhlcvStore,
    job: JobLog,
    full: bool = False,
) -> dict[str, dict]:
    """Fetch and merge bars. Returns {symbol: merge_result | {'error': ...}}."""
    symbols = sorted(set(symbols))
    default_start = as_of - timedelta(days=cfg.lookback_daily_days)
    results: dict[str, dict] = {}

    # group symbols by their delta start so one batch download serves many
    groups: dict[date, list[str]] = {}
    for s in symbols:
        start = default_start if full else daily_store.delta_start(s, default_start)
        groups.setdefault(start, []).append(s)

    fetched: dict[str, object] = {}
    for start, group in sorted(groups.items()):
        fetched.update(provider.fetch_daily(group, start, as_of))

    refetch: list[str] = []
    for s in symbols:
        df = fetched.get(s)
        if df is None:
            results[s] = {"error": "no_data_returned"}
            job.error(symbol=s, stage="ingest", error="no_data_returned")
            continue
        r = daily_store.merge(s, df, as_of, force=full)
        if r["divergent"]:
            refetch.append(s)
        results[s] = r

    if refetch:
        job.counters["split_or_adjustment_suspected"] = len(refetch)
        again = provider.fetch_daily(refetch, default_start, as_of)
        for s in refetch:
            df = again.get(s)
            if df is None:
                job.error(symbol=s, stage="refetch_after_divergence", error="no_data_returned")
                continue
            results[s] = daily_store.merge(s, df, as_of, force=True) | {"refetched": True}

    for code in INDEX_TICKERS:
        start = default_start if full else index_store.delta_start(code, default_start)
        df = provider.fetch_index_daily(code, start, as_of)
        if df is None:
            job.error(symbol=code, stage="ingest_index", error="no_data_returned")
            results[code] = {"error": "no_data_returned"}
        else:
            results[code] = index_store.merge(code, df, as_of, force=full)

    ok = sum(1 for s in symbols if "error" not in results.get(s, {"error": 1}))
    job.counters.update({"symbols": len(symbols), "ok": ok, "failed": len(symbols) - ok, "bars_added": sum(int(r.get("added", 0)) for r in results.values())})
    return results
