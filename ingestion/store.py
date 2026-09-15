"""On-disk store: one CSV per symbol for daily OHLCV, one JSON per symbol for fundamentals.

Closed sessions are immutable: on merge, existing rows win. A divergence larger than
`SPLIT_TOLERANCE` on overlapping dates is reported so the caller can force a full refetch.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import pandas as pd

from engine.types import Fundamentals

COLUMNS = ["open", "high", "low", "close", "volume"]
SPLIT_TOLERANCE = 0.005
OVERLAP_SESSIONS = 5


def read_ohlcv(path: Path) -> Optional[pd.DataFrame]:
    if not path.exists():
        return None
    df = pd.read_csv(path, index_col="date", parse_dates=True)
    df = df[COLUMNS].sort_index()
    df.index = pd.DatetimeIndex(df.index).normalize()
    df.index.name = "date"
    return df


def write_ohlcv(path: Path, df: pd.DataFrame) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    out = df[COLUMNS].copy()
    out.index = pd.DatetimeIndex(out.index).normalize()
    out.index.name = "date"
    out["volume"] = out["volume"].round().astype("int64")
    out.to_csv(path, float_format="%.4f", lineterminator="\n", date_format="%Y-%m-%d")


class OhlcvStore:
    def __init__(self, root: Path, lookback_days: int):
        self.root = root
        self.lookback_days = lookback_days

    def path(self, symbol: str) -> Path:
        return self.root / f"{symbol}.csv"

    def load(self, symbol: str) -> Optional[pd.DataFrame]:
        return read_ohlcv(self.path(symbol))

    def last_date(self, symbol: str) -> Optional[date]:
        df = self.load(symbol)
        return None if df is None or df.empty else pd.Timestamp(df.index[-1]).date()

    def delta_start(self, symbol: str, default_start: date) -> date:
        last = self.last_date(symbol)
        if last is None:
            return default_start
        return last - timedelta(days=OVERLAP_SESSIONS * 2)  # calendar days covering ~5 sessions

    def merge(self, symbol: str, new: pd.DataFrame, as_of: date, force: bool = False) -> dict:
        """Merge new bars. Returns {'added': n, 'divergent': bool, 'rows': total}."""
        new = new[COLUMNS].copy()
        new.index = pd.DatetimeIndex(new.index).normalize()
        new = new[~new.index.duplicated(keep="last")].sort_index()
        new = new[new.index.date <= as_of]
        old = self.load(symbol)
        divergent = False
        if old is not None and not old.empty and not force:
            common = old.index.intersection(new.index)
            if len(common):
                a = old.loc[common, "close"].to_numpy(dtype=float)
                b = new.loc[common, "close"].to_numpy(dtype=float)
                divergent = bool(((abs(a - b) / a) > SPLIT_TOLERANCE).any())
            combined = pd.concat([old, new[~new.index.isin(old.index)]]).sort_index()
            added = len(combined) - len(old)
        else:
            combined = new
            added = len(new)
        cutoff = pd.Timestamp(as_of) - pd.Timedelta(days=self.lookback_days)
        combined = combined[combined.index >= cutoff]
        write_ohlcv(self.path(symbol), combined)
        return {"added": int(added), "divergent": divergent, "rows": int(len(combined))}


class FundamentalsStore:
    def __init__(self, root: Path, ttl_hours: int = 24):
        self.root = root
        self.ttl = timedelta(hours=ttl_hours)

    def path(self, symbol: str) -> Path:
        return self.root / f"{symbol}.json"

    def load(self, symbol: str) -> Optional[Fundamentals]:
        p = self.path(symbol)
        if not p.exists():
            return None
        raw = json.loads(p.read_text(encoding="utf-8"))
        return Fundamentals(**{k: raw.get(k) for k in Fundamentals.__dataclass_fields__})

    def is_fresh(self, symbol: str, now: datetime | None = None) -> bool:
        f = self.load(symbol)
        if f is None or not f.fetched_at:
            return False
        now = now or datetime.now(timezone.utc)
        fetched = datetime.fromisoformat(f.fetched_at)
        if fetched.tzinfo is None:
            fetched = fetched.replace(tzinfo=timezone.utc)
        return now - fetched < self.ttl

    def save(self, symbol: str, f: Fundamentals) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        self.path(symbol).write_text(json.dumps(asdict(f), indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
