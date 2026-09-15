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
    fno_eligible: bool = True
    """False for a row sourced from the full cash-equity list that is not also in the F&O list.
    Short setups are only generated for fno_eligible symbols."""


@dataclass(frozen=True)
class UniverseSnapshot:
    rows: tuple[UniverseRow, ...]
    as_of: date
    source: str  # live | manual_csv

    @property
    def symbols(self) -> list[str]:
        return sorted({r.symbol for r in self.rows})

    def by_symbol(self) -> dict[str, "UniverseRow"]:
        return {r.symbol: r for r in self.rows}


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


def merge_universes(fno: UniverseSnapshot, equity: Optional[UniverseSnapshot]) -> list[UniverseRow]:
    """Union of the full cash-equity list and the F&O list, deduplicated on symbol.
    Every F&O row is marked fno_eligible=True regardless of what the equity list says;
    everything else keeps the equity list's flag (normally False)."""
    by_symbol: dict[str, UniverseRow] = {}
    if equity is not None:
        for r in equity.rows:
            by_symbol[r.symbol] = r
    for r in fno.rows:
        prior = by_symbol.get(r.symbol)
        by_symbol[r.symbol] = UniverseRow(
            symbol=r.symbol,
            name=r.name or (prior.name if prior else None),
            sector=r.sector or (prior.sector if prior else None),
            industry=r.industry or (prior.industry if prior else None),
            isin=r.isin or (prior.isin if prior else None),
            lot_size=r.lot_size,
            fno_eligible=True,
        )
    return sorted(by_symbol.values(), key=lambda r: r.symbol)


class BanListProvider(Protocol):
    def fetch(self, for_date: date) -> Optional[BanListSnapshot]: ...


class ProviderError(Exception):
    """Raised by providers for non-recoverable failures. Callers record it per symbol."""
