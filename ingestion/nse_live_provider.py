"""Live NSE universe and ban list.

Sources (verified 2026-09-12):
  * https://nsearchives.nseindia.com/content/fo/fo_mktlots.csv   F&O underlyings with lot sizes
  * https://www.nseindia.com/api/master-quote                     JSON list of F&O symbols (needs cookie warm-up)
  * https://nsearchives.nseindia.com/content/fo/fo_secban.csv    "Securities in Ban For Trade Date DD-MON-YYYY:" + rows

nseindia.com is frequently blocked from datacentre IPs. Every failure is explicit and returns
None so the caller falls back to the committed CSV snapshot. Parsing is separated from fetching
so it can be unit-tested offline.
"""

from __future__ import annotations

import csv
import io
import logging
import re
from datetime import date, datetime
from typing import Optional

import requests

from .protocols import BanListSnapshot, UniverseRow, UniverseSnapshot

log = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/",
}
HOME = "https://www.nseindia.com"
MASTER_QUOTE_URL = f"{HOME}/api/master-quote"
MKTLOTS_URL = "https://nsearchives.nseindia.com/content/fo/fo_mktlots.csv"
SECBAN_URL = "https://nsearchives.nseindia.com/content/fo/fo_secban.csv"
MIN_UNIVERSE = 50
INDEX_UNDERLYINGS = {"NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "NIFTYNXT50"}


def parse_mktlots(text: str) -> list[UniverseRow]:
    """fo_mktlots.csv: UNDERLYING, SYMBOL, <month columns...>. Index rows are excluded."""
    rows: list[UniverseRow] = []
    reader = csv.reader(io.StringIO(text))
    header = next(reader, None)
    if not header or len(header) < 3:
        return rows
    for rec in reader:
        if len(rec) < 3:
            continue
        name, symbol = rec[0].strip(), rec[1].strip().upper()
        if not symbol or symbol in INDEX_UNDERLYINGS or symbol == "SYMBOL" or name.upper().startswith("DERIVATIVES ON"):
            continue
        lot = None
        for cell in rec[2:]:
            cell = cell.strip()
            if cell.isdigit():
                lot = int(cell)
                break
        rows.append(UniverseRow(symbol=symbol, name=name or None, lot_size=lot))
    return rows


def parse_secban(text: str) -> tuple[Optional[date], frozenset[str]]:
    """fo_secban.csv: first line 'Securities in Ban For Trade Date 15-SEP-2026:' then 'n,SYMBOL' rows."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if not lines:
        return None, frozenset()
    m = re.search(r"(\d{1,2}-[A-Za-z]{3}-\d{4})", lines[0])
    trade_date = datetime.strptime(m.group(1).upper(), "%d-%b-%Y").date() if m else None
    syms = set()
    for ln in lines[1:]:
        parts = [p.strip() for p in ln.split(",")]
        sym = parts[-1] if parts else ""
        if sym and not sym.isdigit():
            syms.add(sym.upper())
    return trade_date, frozenset(syms)


class NseLiveProvider:
    def __init__(self, timeout: float = 15.0):
        self.timeout = timeout
        self.last_error: Optional[str] = None

    def _session(self) -> requests.Session:
        s = requests.Session()
        s.headers.update(HEADERS)
        s.get(HOME, timeout=self.timeout)  # cookie warm-up; failures surface on the next call
        return s

    def fetch(self) -> Optional[UniverseSnapshot]:
        try:
            s = self._session()
            r = s.get(MKTLOTS_URL, timeout=self.timeout)
            r.raise_for_status()
            rows = parse_mktlots(r.text)
            if len(rows) < MIN_UNIVERSE:
                # second source: master-quote symbol list (no lot sizes)
                r2 = s.get(MASTER_QUOTE_URL, timeout=self.timeout)
                r2.raise_for_status()
                syms = [str(x).upper() for x in r2.json() if isinstance(x, str)]
                rows = [UniverseRow(symbol=x) for x in syms if x not in INDEX_UNDERLYINGS]
            if len(rows) < MIN_UNIVERSE:
                self.last_error = f"universe too small: {len(rows)}"
                return None
            return UniverseSnapshot(tuple(sorted(rows, key=lambda x: x.symbol)), date.today(), "live")
        except (requests.RequestException, ValueError, KeyError) as exc:
            self.last_error = f"{type(exc).__name__}: {exc}"
            log.warning("nse universe fetch failed: %s", self.last_error)
            return None

    def fetch_ban_list(self, for_date: date) -> Optional[BanListSnapshot]:
        """Returns the published ban list with its own trade date as `as_of`. The caller decides
        whether that trade date applies to `for_date` (see CsvBanListProvider.applicable)."""
        try:
            s = self._session()
            r = s.get(SECBAN_URL, timeout=self.timeout)
            r.raise_for_status()
            trade_date, syms = parse_secban(r.text)
            if trade_date is None:
                self.last_error = "secban: trade date not found in header"
                return None
            return BanListSnapshot(syms, trade_date, "live", "ok")
        except (requests.RequestException, ValueError) as exc:
            self.last_error = f"{type(exc).__name__}: {exc}"
            log.warning("nse ban list fetch failed: %s", self.last_error)
            return None
