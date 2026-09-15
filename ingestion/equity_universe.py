"""Full NSE cash-equity list (~2,000 symbols) — the long-side scanning universe.

Source (verified 2026-09): https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv
Columns: SYMBOL, NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE, MARKET LOT, ISIN NUMBER,
FACE VALUE. Only SERIES == "EQ" (and "BE" trade-to-trade is excluded) rows are kept — those are the
normal, freely tradeable equity series.

Shorts remain restricted to the ~211-symbol F&O list (ingestion/nse_live_provider.py); this module
only ever produces fno_eligible=False rows, and gets combined with the F&O list in
`protocols.merge_universes`.
"""

from __future__ import annotations

import csv
import io
import logging
from datetime import date
from typing import Optional

import requests

from .protocols import UniverseRow, UniverseSnapshot

log = logging.getLogger(__name__)

EQUITY_LIST_URL = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "*/*",
    "Referer": "https://www.nseindia.com/",
}
INCLUDED_SERIES = {"EQ"}
MIN_ROWS = 1000


def parse_equity_list(text: str) -> list[UniverseRow]:
    rows: list[UniverseRow] = []
    reader = csv.DictReader(io.StringIO(text))
    for rec in reader:
        series = (rec.get("SERIES") or rec.get(" SERIES") or "").strip()
        symbol = (rec.get("SYMBOL") or "").strip().upper()
        if not symbol or series not in INCLUDED_SERIES:
            continue
        rows.append(UniverseRow(
            symbol=symbol,
            name=(rec.get("NAME OF COMPANY") or "").strip() or None,
            isin=(rec.get(" ISIN NUMBER") or rec.get("ISIN NUMBER") or "").strip() or None,
            fno_eligible=False,
        ))
    return rows


class NseEquityListProvider:
    def __init__(self, timeout: float = 20.0):
        self.timeout = timeout
        self.last_error: Optional[str] = None

    def fetch(self) -> Optional[UniverseSnapshot]:
        try:
            r = requests.get(EQUITY_LIST_URL, headers=HEADERS, timeout=self.timeout)
            r.raise_for_status()
            rows = parse_equity_list(r.text)
            if len(rows) < MIN_ROWS:
                self.last_error = f"equity list too small: {len(rows)}"
                return None
            return UniverseSnapshot(tuple(rows), date.today(), "live")
        except (requests.RequestException, ValueError) as exc:
            self.last_error = f"{type(exc).__name__}: {exc}"
            log.warning("nse equity list fetch failed: %s", self.last_error)
            return None
