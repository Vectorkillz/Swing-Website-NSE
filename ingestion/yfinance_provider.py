"""yfinance-backed OHLCV and fundamentals.

Unit normalisation happens ONLY here:
  marketCap (INR)          -> market_cap_cr = marketCap / 1e7
  debtToEquity (percent)   -> debt_equity   = debtToEquity / 100   (ratio)
  returnOnEquity (fraction)-> roe            = x * 100              (percent)
  (when returnOnEquity is absent) roe = netIncomeToCommon / (bookValue x sharesOutstanding) x 100,
                                  flagged in Fundamentals.roe_source as "derived:..."
  revenueGrowth (fraction) -> revenue_growth = x * 100
  earningsGrowth (fraction)-> eps_growth     = x * 100
  freeCashflow (INR)       -> fcf_positive   = x > 0
Missing fields stay None. Nothing is coerced to zero.
"""

from __future__ import annotations

import logging
import time
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, Optional

import pandas as pd
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from engine.types import Fundamentals

from .protocols import ProviderError
from .symbols import INDEX_TICKERS, nse_to_yf, yf_to_nse

log = logging.getLogger(__name__)

COLUMN_MAP = {"Open": "open", "High": "high", "Low": "low", "Close": "close", "Volume": "volume"}


def _clean(df: pd.DataFrame) -> Optional[pd.DataFrame]:
    if df is None or df.empty:
        return None
    df = df.rename(columns=COLUMN_MAP)
    keep = [c for c in ("open", "high", "low", "close", "volume") if c in df.columns]
    if len(keep) < 5:
        return None
    out = df[keep].dropna(subset=["open", "high", "low", "close"]).copy()
    out.index = pd.DatetimeIndex(pd.to_datetime(out.index)).tz_localize(None).normalize()
    out.index.name = "date"
    out = out[~out.index.duplicated(keep="last")].sort_index()
    return out if not out.empty else None


class YFinanceProvider:
    def __init__(self, batch_size: int = 50, pause_s: float = 1.5, info_pause_s: float = 0.6):
        import yfinance as yf  # imported lazily so the engine/tests never need it

        self.yf = yf
        self.batch_size = batch_size
        self.pause_s = pause_s
        self.info_pause_s = info_pause_s

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2, min=2, max=30), retry=retry_if_exception_type(ProviderError), reraise=True)
    def _download(self, tickers: list[str], start: date, end: date) -> pd.DataFrame:
        df = self.yf.download(
            tickers=" ".join(tickers), start=start.isoformat(), end=(end + timedelta(days=1)).isoformat(),
            interval="1d", group_by="ticker", auto_adjust=False, actions=False, threads=False, progress=False,
        )
        if df is None or df.empty:
            raise ProviderError(f"empty download for {len(tickers)} tickers")
        return df

    def fetch_daily(self, symbols: list[str], start: date, end: date) -> dict[str, pd.DataFrame]:
        out: dict[str, pd.DataFrame] = {}
        syms = sorted(set(symbols))
        for i in range(0, len(syms), self.batch_size):
            batch = syms[i : i + self.batch_size]
            tickers = [nse_to_yf(s) for s in batch]
            try:
                raw = self._download(tickers, start, end)
            except ProviderError as exc:
                log.warning("batch %d failed: %s", i // self.batch_size, exc)
                continue
            for s, t in zip(batch, tickers):
                try:
                    part = raw[t] if isinstance(raw.columns, pd.MultiIndex) else raw
                except KeyError:
                    continue
                cleaned = _clean(part)
                if cleaned is not None:
                    out[s] = cleaned
            if i + self.batch_size < len(syms):
                time.sleep(self.pause_s)
        return out

    def fetch_index_daily(self, index_code: str, start: date, end: date) -> Optional[pd.DataFrame]:
        ticker = INDEX_TICKERS[index_code]
        try:
            raw = self._download([ticker], start, end)
        except ProviderError as exc:
            log.warning("index %s failed: %s", index_code, exc)
            return None
        part = raw[ticker] if isinstance(raw.columns, pd.MultiIndex) else raw
        return _clean(part)

    def fetch(self, symbol: str) -> Optional[Fundamentals]:
        """Fundamentals via Ticker.info. Returns None when the endpoint fails entirely."""
        try:
            info = self.yf.Ticker(nse_to_yf(symbol)).info or {}
        except Exception as exc:  # yfinance raises assorted exception types here; recorded, not swallowed silently
            log.warning("fundamentals %s failed: %s: %s", symbol, type(exc).__name__, exc)
            return None
        finally:
            time.sleep(self.info_pause_s)
        if not info or info.get("regularMarketPrice") is None and info.get("marketCap") is None:
            return None

        def num(key: str) -> Optional[float]:
            v = info.get(key)
            return float(v) if isinstance(v, (int, float)) and v == v else None

        mcap = num("marketCap")
        de = num("debtToEquity")
        roe = num("returnOnEquity")
        roe_source: Optional[str] = "returnOnEquity" if roe is not None else None
        if roe is None:
            # yfinance omits returnOnEquity for most NSE names but usually has the inputs.
            # ROE = net income to common / (book value per share x shares outstanding). Recorded as derived.
            ni, bvps, sh = num("netIncomeToCommon"), num("bookValue"), num("sharesOutstanding")
            if ni is not None and bvps is not None and sh is not None and bvps > 0 and sh > 0:
                roe = ni / (bvps * sh)
                roe_source = "derived:netIncomeToCommon/(bookValue*sharesOutstanding)"
        rev = num("revenueGrowth")
        eps = num("earningsGrowth")
        fcf = num("freeCashflow")
        return Fundamentals(
            market_cap_cr=mcap / 1e7 if mcap is not None else None,
            avg_volume=num("averageVolume"),
            debt_equity=de / 100.0 if de is not None else None,
            roe=roe * 100.0 if roe is not None else None,
            revenue_growth=rev * 100.0 if rev is not None else None,
            eps_growth=eps * 100.0 if eps is not None else None,
            fcf_positive=(fcf > 0) if fcf is not None else None,
            sector=info.get("sector"),
            industry=info.get("industry"),
            name=info.get("longName") or info.get("shortName"),
            fetched_at=datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            source="yfinance.Ticker.info",
            roe_source=roe_source,
        )
