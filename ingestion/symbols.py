"""NSE symbol <-> yfinance ticker mapping and index codes."""

from __future__ import annotations

INDEX_TICKERS = {
    "NIFTY": "^NSEI",
    "INDIAVIX": "^INDIAVIX",
    "SMALLCAP": "^CNXSC",
}


def nse_to_yf(symbol: str) -> str:
    s = symbol.strip().upper()
    if s.startswith("^"):
        return s
    return s.replace("&", "%26") + ".NS"


def yf_to_nse(ticker: str) -> str:
    t = ticker.strip().upper()
    if t.endswith(".NS"):
        t = t[:-3]
    return t.replace("%26", "&")
