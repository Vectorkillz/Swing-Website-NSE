"""NSE index constituent lists (Nifty 50, Nifty 200, Nifty Smallcap 250) for search scoping in the UI.

Source (verified 2026-09): https://nsearchives.nseindia.com/content/indices/ind_nifty50list.csv etc.
Columns: Company Name, Industry, Symbol, Series, ISIN Code.

Output: data/universe/index_membership.json
  {"as_of": "YYYY-MM-DD", "source": "live"|"csv", "sets": {"NIFTY50": [...], "NIFTY200": [...], "SMALLCAP250": [...]},
   "live_error": null | str}
Membership only labels rows; it never changes what the scanner does.
"""

from __future__ import annotations

import csv
import io
import json
import logging
from datetime import date
from pathlib import Path
from typing import Optional

import requests

from .equity_universe import HEADERS

log = logging.getLogger(__name__)

BASE = "https://nsearchives.nseindia.com/content/indices/"
INDEX_FILES = {
    "NIFTY50": "ind_nifty50list.csv",
    "NIFTY200": "ind_nifty200list.csv",
    "SMALLCAP250": "ind_niftysmallcap250list.csv",
}
MIN_ROWS = {"NIFTY50": 45, "NIFTY200": 180, "SMALLCAP250": 220}
FILENAME = "index_membership.json"


def parse_index_csv(text: str) -> list[str]:
    out: list[str] = []
    for rec in csv.DictReader(io.StringIO(text)):
        sym = (rec.get("Symbol") or rec.get("SYMBOL") or "").strip().upper()
        series = (rec.get("Series") or rec.get("SERIES") or "EQ").strip()
        if sym and series == "EQ":
            out.append(sym)
    return sorted(set(out))


class NseIndexMembershipProvider:
    def __init__(self, timeout: float = 20.0):
        self.timeout = timeout
        self.last_error: Optional[str] = None

    def fetch(self) -> Optional[dict[str, list[str]]]:
        sets: dict[str, list[str]] = {}
        try:
            for key, fname in INDEX_FILES.items():
                r = requests.get(BASE + fname, headers=HEADERS, timeout=self.timeout)
                r.raise_for_status()
                rows = parse_index_csv(r.text)
                if len(rows) < MIN_ROWS[key]:
                    self.last_error = f"{key}: only {len(rows)} rows"
                    return None
                sets[key] = rows
            return sets
        except (requests.RequestException, ValueError) as exc:
            self.last_error = f"{type(exc).__name__}: {exc}"
            log.warning("index membership fetch failed: %s", self.last_error)
            return None


def load_membership(universe_dir: Path) -> Optional[dict]:
    p = universe_dir / FILENAME
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def save_membership(universe_dir: Path, sets: dict[str, list[str]], source: str, live_error: Optional[str]) -> Path:
    universe_dir.mkdir(parents=True, exist_ok=True)
    p = universe_dir / FILENAME
    doc = {"schema_version": 1, "as_of": date.today().isoformat(), "source": source, "live_error": live_error, "sets": {k: sorted(v) for k, v in sorted(sets.items())}}
    p.write_text(json.dumps(doc, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    return p
