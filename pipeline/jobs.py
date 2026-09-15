"""Job entry points used by the CLI and GitHub Actions. All I/O lives here."""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional

from engine.config import ScanConfig, load_profile
from ingestion.calendar import NseCalendar
from ingestion.csv_providers import CsvBanListProvider, CsvUniverseProvider
from ingestion.protocols import BanListSnapshot, UniverseSnapshot
from ingestion.store import FundamentalsStore, OhlcvStore
from pipeline import paths
from pipeline.ingest_job import ingest
from pipeline.job_log import JobLog
from pipeline.scan_job import ban_meta, build_inputs_from_repo, execute_scan, universe_meta

log = logging.getLogger(__name__)


def active_profile(profile: Optional[str] = None) -> tuple[str, ScanConfig]:
    version = profile or json.loads(paths.ACTIVE_FILE.read_text(encoding="utf-8"))["active"]
    return load_profile(paths.PROFILES_DIR / f"{version}.json")


def _stores(cfg: ScanConfig) -> tuple[OhlcvStore, OhlcvStore, FundamentalsStore]:
    return OhlcvStore(paths.OHLCV_DAILY, cfg.lookback_daily_days), OhlcvStore(paths.OHLCV_INDEX, cfg.lookback_daily_days), FundamentalsStore(paths.FUNDAMENTALS)


def load_universe() -> Optional[UniverseSnapshot]:
    return CsvUniverseProvider(paths.UNIVERSE).fetch()


def _live(live_enabled: bool):
    if not live_enabled:
        return None
    from ingestion.nse_live_provider import NseLiveProvider

    return NseLiveProvider()


def job_refresh_universe(live_enabled: bool = True) -> str:
    job = JobLog(paths.JOBS, "refresh_universe")
    csv = CsvUniverseProvider(paths.UNIVERSE)
    live = _live(live_enabled)
    snap = live.fetch() if live else None
    err = live.last_error if live else "live_disabled"
    if snap is not None:
        # keep sector/industry/name from the previous snapshot or cached fundamentals where the live source lacks them
        prev = csv.fetch()
        prev_map = {r.symbol: (r.sector, r.industry) for r in prev.rows} if prev else {}
        funds = FundamentalsStore(paths.FUNDAMENTALS)
        sectors = {}
        for s in snap.symbols:
            f = funds.load(s)
            sectors[s] = (f.sector, f.industry) if f and (f.sector or f.industry) else prev_map.get(s, (None, None))
        snap = csv.merge_sectors(snap, sectors)
        csv.save(snap, live_error=None)
        job.counters["n_symbols"] = len(snap.symbols)
        job.counters["source"] = "live"
        return _finish(job, "ok")
    existing = csv.fetch()
    if existing is not None:
        csv.save(existing, live_error=err)  # refresh status.json with the failure, keep the CSV
        job.counters["n_symbols"] = len(existing.symbols)
        job.counters["source"] = existing.source
        job.error(stage="live_fetch", error=err)
        return _finish(job, "fallback_csv")
    job.error(stage="live_fetch", error=err)
    job.error(stage="fallback", error="no committed universe CSV; upload data/universe/fno_universe.csv")
    return _finish(job, "failed")


def job_refresh_ban_list(session: date, live_enabled: bool = True) -> tuple[Optional[BanListSnapshot], Optional[str]]:
    from ingestion.csv_providers import applicable

    csv = CsvBanListProvider(paths.BAN_LIST)
    live = _live(live_enabled)
    snap = live.fetch_ban_list(session) if live else None
    err = live.last_error if live else "live_disabled"
    if snap is not None:
        csv.save(snap)  # always keep the published file, dated by its trade date
        if applicable(snap, session):
            return snap, None
        err = f"published ban list is for {snap.as_of}, not applicable to session {session}"
    return csv.fetch(session), err


def job_ingest(as_of: Optional[date] = None, full: bool = False, profile: Optional[str] = None, symbols: Optional[list[str]] = None) -> str:
    version, cfg = active_profile(profile)
    job = JobLog(paths.JOBS, "ingest_ohlcv")
    cal = NseCalendar(paths.CALENDAR)
    as_of = as_of or cal.expected_last_session()
    job.extra["as_of"] = as_of.isoformat()
    uni = load_universe()
    if uni is None and not symbols:
        job.error(stage="universe", error="no universe snapshot")
        return _finish(job, "failed")
    from ingestion.yfinance_provider import YFinanceProvider

    daily, index, _ = _stores(cfg)
    ingest(symbols or uni.symbols, as_of, cfg, YFinanceProvider(), daily, index, job, full=full)
    status = "ok" if job.counters.get("failed", 0) == 0 else "partial"
    return _finish(job, status)


def job_refresh_fundamentals(shard: str = "0/1", profile: Optional[str] = None, force: bool = False) -> str:
    version, cfg = active_profile(profile)
    job = JobLog(paths.JOBS, "refresh_fundamentals")
    k, n = (int(x) for x in shard.split("/"))
    uni = load_universe()
    if uni is None:
        job.error(stage="universe", error="no universe snapshot")
        return _finish(job, "failed")
    from ingestion.yfinance_provider import YFinanceProvider

    _, _, store = _stores(cfg)
    prov = YFinanceProvider()
    mine = [s for i, s in enumerate(uni.symbols) if i % n == k]
    fetched = skipped = failed = 0
    for s in mine:
        if not force and store.is_fresh(s):
            skipped += 1
            continue
        f = prov.fetch(s)
        if f is None:
            failed += 1
            job.error(symbol=s, stage="fundamentals", error="no_data")
            continue
        store.save(s, f)
        fetched += 1
    job.counters.update({"shard": shard, "symbols": len(mine), "fetched": fetched, "skipped_fresh": skipped, "failed": failed})
    return _finish(job, "ok" if failed == 0 else "partial")


def job_scan(session: Optional[date] = None, profile: Optional[str] = None, live_ban_list: bool = True, generated_at: Optional[str] = None) -> str:
    version, cfg = active_profile(profile)
    job = JobLog(paths.JOBS, "run_scan")
    cal = NseCalendar(paths.CALENDAR)
    session = session or cal.expected_last_session()
    job.extra["session_date"] = session.isoformat()
    if not cal.is_trading_day(session):
        job.error(stage="calendar", error=f"{session} is not a trading day")
        return _finish(job, "skipped_holiday")
    uni = load_universe()
    if uni is None:
        job.error(stage="universe", error="no universe snapshot; upload data/universe/fno_universe.csv")
        return _finish(job, "failed")
    ban, ban_err = job_refresh_ban_list(session, live_enabled=live_ban_list)
    daily, index, funds = _stores(cfg)
    inputs, failures = build_inputs_from_repo(session, uni, ban, daily, index, funds)
    today = datetime.now(timezone.utc).date()
    run_id, res = execute_scan(inputs, cfg, version, universe_meta(uni, cfg, today), ban_meta(ban, ban_err), failures, paths.RUNS, paths.CHARTS, generated_at=generated_at)
    job.extra["run_id"] = run_id
    job.counters.update(res.counts)
    job.counters["warnings"] = list(res.warnings)
    status = "ok"
    if not res.scan_performed:
        status = "no_scan_regime_unknown"
    elif any(w.startswith("degraded") for w in res.warnings):
        status = "degraded"
    return _finish(job, status)


def _finish(job: JobLog, status: str) -> str:
    job.finish(status)
    log.info("%s -> %s %s", job.job, status, job.counters)
    return status
