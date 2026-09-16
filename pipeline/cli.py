"""Command-line entry point.

Offline (Phase 1):   scan --data <dir>      scan a local data directory (see tests/fixtures/mini_repo)
Live (Phase 2):      refresh-universe, ingest, refresh-fundamentals, run-scan, calendar-check
Utilities:           export-schema

Local data directory layout for `scan --data`:
  ohlcv/daily/{SYMBOL}.csv            date,open,high,low,close,volume
  ohlcv/index/NIFTY.csv, INDIAVIX.csv, SMALLCAP.csv
  fundamentals/{SYMBOL}.json           Fundamentals fields (engine/types.py)
  universe.csv                         symbol,name,sector
  ban_list.csv                         symbol   (absent file => ban list unavailable)
"""

from __future__ import annotations

import json
import logging
from datetime import date
from pathlib import Path
from typing import Optional

import pandas as pd
import typer

from engine.canonical import dumps_pretty
from engine.config import config_hash, export_json_schema, load_profile
from engine.types import Fundamentals, ScanInputs, SymbolInput
from pipeline import paths
from pipeline.run_writer import write_text

app = typer.Typer(help="NSE swing scanner pipeline", no_args_is_help=True)
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


def _read_ohlcv(path: Path) -> Optional[pd.DataFrame]:
    if not path.exists():
        return None
    return pd.read_csv(path, index_col="date", parse_dates=True).sort_index()


def _read_fundamentals(path: Path) -> Optional[Fundamentals]:
    if not path.exists():
        return None
    raw = json.loads(path.read_text(encoding="utf-8"))
    return Fundamentals(**{k: raw.get(k) for k in Fundamentals.__dataclass_fields__ if k in raw})


def load_local_inputs(data_dir: Path, session: date) -> tuple[ScanInputs, dict, dict, list[dict]]:
    universe = pd.read_csv(data_dir / "universe.csv")
    failures: list[dict] = []
    symbols = []
    for _, row in universe.iterrows():
        sym = str(row["symbol"])
        try:
            daily = _read_ohlcv(data_dir / "ohlcv" / "daily" / f"{sym}.csv")
        except (ValueError, KeyError, OSError) as exc:
            failures.append({"symbol": sym, "stage": "load_ohlcv", "error": f"{type(exc).__name__}: {exc}"})
            daily = None
        fund = _read_fundamentals(data_dir / "fundamentals" / f"{sym}.json")
        sector = row["sector"] if "sector" in universe.columns and pd.notna(row.get("sector")) else None
        name = row["name"] if "name" in universe.columns and pd.notna(row.get("name")) else None
        fno_eligible = bool(row["fno_eligible"]) if "fno_eligible" in universe.columns and pd.notna(row.get("fno_eligible")) else True
        symbols.append(SymbolInput(sym, daily, fund, sector=sector, name=name, fno_eligible=fno_eligible))
    nifty = _read_ohlcv(data_dir / "ohlcv" / "index" / "NIFTY.csv")
    vix_df = _read_ohlcv(data_dir / "ohlcv" / "index" / "INDIAVIX.csv")
    vix = float(vix_df["close"].iloc[-1]) if vix_df is not None and len(vix_df) else None
    smallcap = _read_ohlcv(data_dir / "ohlcv" / "index" / "SMALLCAP.csv")
    ban_path = data_dir / "ban_list.csv"
    ban = frozenset(pd.read_csv(ban_path)["symbol"].astype(str)) if ban_path.exists() else None
    inputs = ScanInputs(session, tuple(symbols), nifty, vix, smallcap, ban, universe_size=len(symbols))
    universe_meta = {"source": "local_csv", "as_of": session.isoformat(), "n_symbols": len(symbols), "age_days": 0, "stale": False}
    ban_meta = {"source": "local_csv" if ban is not None else None, "as_of": session.isoformat() if ban is not None else None, "n": len(ban) if ban is not None else 0, "fetch_status": "ok" if ban is not None else "failed", "live_error": None}
    return inputs, universe_meta, ban_meta, failures


@app.command()
def scan(
    data: Path = typer.Option(..., help="Local data directory (see module docstring)."),
    out: Path = typer.Option(paths.RUNS, help="Runs output directory."),
    charts: Optional[Path] = typer.Option(None, help="Charts output directory (default: <out>/../charts)."),
    session_date: Optional[str] = typer.Option(None, "--date", help="Session date YYYY-MM-DD (default: last bar of NIFTY.csv)."),
    profile: Optional[str] = typer.Option(None, help="Config profile version, e.g. v001 (default: config/active.json)."),
    generated_at: Optional[str] = typer.Option(None, help="Override generated_at timestamp (for reproducible output)."),
) -> None:
    """Run a scan from a local CSV/JSON directory (offline) and write the static data contract."""
    from pipeline.jobs import active_profile
    from pipeline.scan_job import execute_scan

    version, cfg = active_profile(profile)
    if session_date:
        session = date.fromisoformat(session_date)
    else:
        nifty = _read_ohlcv(data / "ohlcv" / "index" / "NIFTY.csv")
        if nifty is None:
            typer.echo("NIFTY.csv missing and --date not given", err=True)
            raise typer.Exit(2)
        session = pd.Timestamp(nifty.index[-1]).date()
    inputs, umeta, bmeta, failures = load_local_inputs(data, session)
    run_id, res = execute_scan(inputs, cfg, version, umeta, bmeta, failures, out, charts or (out.parent / "charts"), generated_at=generated_at)
    typer.echo(json.dumps({"run_id": run_id, "warnings": list(res.warnings), "counts": res.counts, "regime": res.regime.regime.value}, indent=2))


@app.command("run-scan")
def run_scan(
    session_date: Optional[str] = typer.Option(None, "--date", help="Session date YYYY-MM-DD (default: expected last session, IST)."),
    profile: Optional[str] = typer.Option(None),
    live_ban_list: bool = typer.Option(True, help="Try nseindia.com for today's ban list before the CSV fallback."),
) -> None:
    """Scan the repo data directory (data/) and write data/runs, data/charts, data/jobs."""
    from pipeline.jobs import job_scan

    status = job_scan(date.fromisoformat(session_date) if session_date else None, profile, live_ban_list)
    typer.echo(f"run_scan: {status}")
    if status == "failed":
        raise typer.Exit(1)


@app.command()
def ingest(
    as_of: Optional[str] = typer.Option(None, help="Session date to ingest up to (default: expected last session)."),
    full: bool = typer.Option(False, help="Refetch the full lookback for every symbol."),
    symbols: Optional[str] = typer.Option(None, help="Comma-separated subset of symbols (default: universe)."),
    profile: Optional[str] = typer.Option(None),
) -> None:
    """Delta-ingest daily OHLCV for the universe and indices via yfinance."""
    from pipeline.jobs import job_ingest

    status = job_ingest(date.fromisoformat(as_of) if as_of else None, full, profile, symbols.split(",") if symbols else None)
    typer.echo(f"ingest: {status}")
    if status == "failed":
        raise typer.Exit(1)


@app.command("refresh-universe")
def refresh_universe(live: bool = typer.Option(True, help="Attempt nseindia.com; fall back to the committed CSV.")) -> None:
    """Refresh data/universe/fno_universe.csv (the ~211-symbol F&O / short-eligible list)."""
    from pipeline.jobs import job_refresh_universe

    status = job_refresh_universe(live)
    typer.echo(f"refresh_universe: {status}")
    if status == "failed":
        raise typer.Exit(1)


@app.command("refresh-equity-list")
def refresh_equity_list(live: bool = typer.Option(True, help="Attempt nseindia.com; fall back to the committed CSV.")) -> None:
    """Refresh data/universe/nse_equity_list.csv (the ~2,000-symbol full cash-equity, long-only universe)."""
    from pipeline.jobs import job_refresh_equity_list

    status = job_refresh_equity_list(live)
    typer.echo(f"refresh_equity_list: {status}")
    if status == "failed":
        raise typer.Exit(1)


@app.command("refresh-index-membership")
def refresh_index_membership(live: bool = typer.Option(True, help="Attempt nsearchives.nseindia.com; keep the committed JSON otherwise.")) -> None:
    """Refresh data/universe/index_membership.json (Nifty 50 / 200 / Smallcap 250 constituents, UI labels only)."""
    from pipeline.jobs import job_refresh_index_membership

    status = job_refresh_index_membership(live)
    typer.echo(f"refresh_index_membership: {status}")
    if status == "failed":
        raise typer.Exit(1)


@app.command("refresh-fundamentals")
def refresh_fundamentals(shard: str = typer.Option("0/1", help="k/n shard of the universe."), force: bool = False, profile: Optional[str] = None) -> None:
    """Refresh fundamentals (24h TTL) for a shard of the universe."""
    from pipeline.jobs import job_refresh_fundamentals

    typer.echo(f"refresh_fundamentals: {job_refresh_fundamentals(shard, profile, force)}")


@app.command("calendar-check")
def calendar_check(session_date: Optional[str] = typer.Option(None, "--date")) -> None:
    """Exit 0 if the session is a trading day, 78 otherwise (used by the scan workflow)."""
    from ingestion.calendar import NseCalendar

    cal = NseCalendar(paths.CALENDAR)
    d = date.fromisoformat(session_date) if session_date else cal.expected_last_session()
    ok = cal.is_trading_day(d)
    typer.echo(json.dumps({"session": d.isoformat(), "trading_day": ok, "calendar_has_year": cal.has_year(d.year)}))
    if not ok:
        raise typer.Exit(78)


@app.command("export-schema")
def export_schema(out: Path = typer.Option(paths.CONFIG_OUT)) -> None:
    """Write data/config/schema.json plus copies of the profiles and the active pointer."""
    write_text(out / "schema.json", dumps_pretty(export_json_schema()))
    for p in sorted(paths.PROFILES_DIR.glob("*.json")):
        version, cfg = load_profile(p)
        write_text(out / "profiles" / p.name, dumps_pretty({"version": version, "config_hash": config_hash(cfg), "values": cfg.model_dump(mode="json")}))
    write_text(out / "active.json", paths.ACTIVE_FILE.read_text(encoding="utf-8"))
    write_text(out / "profiles" / "index.json", dumps_pretty({"versions": [p.stem for p in sorted(paths.PROFILES_DIR.glob("*.json"))]}))
    typer.echo(f"schema written to {out}")


def main() -> None:  # pragma: no cover
    app()


if __name__ == "__main__":  # pragma: no cover
    main()
