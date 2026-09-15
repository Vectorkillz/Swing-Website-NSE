"""Committed-CSV fallbacks for the F&O universe and the ban list.

data/universe/fno_universe.csv   symbol,name,sector,industry,isin,lot_size  (+ status.json with as_of/source)
data/ban_list/YYYY-MM-DD.csv     symbol   (file name = the TRADE DATE the ban applies to)
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

import pandas as pd

from .protocols import BanListSnapshot, UniverseRow, UniverseSnapshot

BAN_WINDOW_DAYS = 4  # a ban list dated for the next session (weekend/holiday gap) still applies to plans made today


def _opt(row, col) -> Optional[str]:
    if col not in row or pd.isna(row[col]):
        return None
    return str(row[col])


class CsvUniverseProvider:
    def __init__(self, universe_dir: Path):
        self.csv = universe_dir / "fno_universe.csv"
        self.status = universe_dir / "status.json"

    def fetch(self) -> Optional[UniverseSnapshot]:
        if not self.csv.exists():
            return None
        df = pd.read_csv(self.csv)
        as_of = date.today()
        source = "manual_csv"
        if self.status.exists():
            st = json.loads(self.status.read_text(encoding="utf-8"))
            as_of = date.fromisoformat(st.get("as_of", as_of.isoformat()))
            source = st.get("source", source)
        rows = tuple(
            UniverseRow(
                symbol=str(r["symbol"]).strip().upper(),
                name=_opt(r, "name"), sector=_opt(r, "sector"), industry=_opt(r, "industry"), isin=_opt(r, "isin"),
                lot_size=int(r["lot_size"]) if "lot_size" in df.columns and pd.notna(r.get("lot_size")) else None,
            )
            for _, r in df.iterrows()
        )
        return UniverseSnapshot(rows, as_of, source)

    def save(self, snap: UniverseSnapshot, live_error: Optional[str] = None) -> None:
        self.csv.parent.mkdir(parents=True, exist_ok=True)
        cols = ["symbol", "name", "sector", "industry", "isin", "lot_size"]
        df = pd.DataFrame([r.__dict__ for r in snap.rows]).reindex(columns=cols).sort_values("symbol")
        df["lot_size"] = df["lot_size"].astype("Int64")
        df.to_csv(self.csv, index=False, lineterminator="\n")
        self.status.write_text(
            json.dumps({"as_of": snap.as_of.isoformat(), "source": snap.source, "n_symbols": len(snap.symbols), "live_error": live_error}, indent=2, sort_keys=True) + "\n",
            encoding="utf-8", newline="\n",
        )

    def merge_sectors(self, snap: UniverseSnapshot, sectors: dict[str, tuple[Optional[str], Optional[str]]]) -> UniverseSnapshot:
        """Fill sector/industry from fundamentals where the universe source lacks them."""
        rows = []
        for r in snap.rows:
            sec, ind = sectors.get(r.symbol, (None, None))
            rows.append(UniverseRow(r.symbol, r.name, r.sector or sec, r.industry or ind, r.isin, r.lot_size))
        return UniverseSnapshot(tuple(rows), snap.as_of, snap.source)


def applicable(snap: BanListSnapshot, for_date: date) -> bool:
    """A ban list applies to plans made on `for_date` when its trade date is that session or the next few days."""
    return for_date <= snap.as_of <= for_date + timedelta(days=BAN_WINDOW_DAYS)


class CsvBanListProvider:
    def __init__(self, ban_dir: Path):
        self.dir = ban_dir

    def fetch(self, for_date: date) -> Optional[BanListSnapshot]:
        """Earliest committed file whose trade date is applicable to `for_date`; None otherwise."""
        if not self.dir.exists():
            return None
        candidates = []
        for p in self.dir.glob("*.csv"):
            try:
                d = date.fromisoformat(p.stem)
            except ValueError:
                continue
            if for_date <= d <= for_date + timedelta(days=BAN_WINDOW_DAYS):
                candidates.append((d, p))
        if not candidates:
            return None
        d, p = min(candidates)
        df = pd.read_csv(p)
        syms = frozenset(str(s).strip().upper() for s in df["symbol"].dropna()) if "symbol" in df.columns else frozenset()
        return BanListSnapshot(syms, d, "manual_csv", "ok")

    def save(self, snap: BanListSnapshot) -> None:
        self.dir.mkdir(parents=True, exist_ok=True)
        pd.DataFrame({"symbol": sorted(snap.symbols)}).to_csv(self.dir / f"{snap.as_of.isoformat()}.csv", index=False, lineterminator="\n")
