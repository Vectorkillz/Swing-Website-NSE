"""Provider interfaces. Implementations are swapped by configuration, never by editing callers."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Optional, Protocol

import pandas as pd

from engine.types import Fundamentals


@dataclass(frozen=True)
class UniverseRow:
    symbol: str
    name: Optional[str] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    isin: Optional[str] = None
    lot_size: Optional[int] = None


@dataclass(frozen=True)
class UniverseSnapshot:
    rows: tuple[UniverseRow, ...]
    as_of: date
    source: str  # live | manual_csv

    @property
    def symbols(self) -> list[str]:
        return sorted({r.symbol for r in self.rows})


@dataclass(frozen=True)
class BanListSnapshot:
    symbols: frozenset[str]
    as_of: date
    source: str  # live | manual_csv
    fetch_status: str  # ok | failed | stale


class OhlcvProvider(Protocol):
    def fetch_daily(self, symbols: list[str], start: date, end: date) -> dict[str, pd.DataFrame]:
        """Return {symbol: frame} for symbols that returned data. Missing symbols are simply absent."""

    def fetch_index_daily(self, index_code: str, start: date, end: date) -> Optional[pd.DataFrame]: ...


class FundamentalsProvider(Protocol):
    def fetch(self, symbol: str) -> Optional[Fundamentals]: ...


class UniverseProvider(Protocol):
    def fetch(self) -> Optional[UniverseSnapshot]: ...


class BanListProvider(Protocol):
    def fetch(self, for_date: date) -> Optional[BanListSnapshot]: ...


class ProviderError(Exception):
    """Raised by providers for non-recoverable failures. Callers record it per symbol."""
