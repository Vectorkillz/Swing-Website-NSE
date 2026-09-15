"""Indicator implementations. No third-party TA library.

Definitions (documented so tests can check against hand-computed values):

* SMA(n): arithmetic mean of the last n values; NaN until n values exist.
* EMA(n): alpha = 2/(n+1); seeded with SMA(n) at bar n-1 (pandas_ta default `sma=True`),
  then ema[i] = alpha*x[i] + (1-alpha)*ema[i-1]. NaN before bar n-1.
* True range: max(high-low, |high-prev_close|, |low-prev_close|); first bar uses high-low.
* ATR(n): Wilder smoothing. atr[n-1] = SMA(TR, n); atr[i] = (atr[i-1]*(n-1) + tr[i]) / n.
* ROC(n): (x[i] / x[i-n] - 1) * 100.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n, min_periods=n).mean()


def ema(s: pd.Series, n: int) -> pd.Series:
    values = s.to_numpy(dtype=float)
    out = np.full(len(values), np.nan)
    if len(values) < n:
        return pd.Series(out, index=s.index)
    alpha = 2.0 / (n + 1.0)
    out[n - 1] = values[:n].mean()
    for i in range(n, len(values)):
        out[i] = alpha * values[i] + (1.0 - alpha) * out[i - 1]
    return pd.Series(out, index=s.index)


def true_range(high: pd.Series, low: pd.Series, close: pd.Series) -> pd.Series:
    prev_close = close.shift(1)
    tr = pd.concat(
        [high - low, (high - prev_close).abs(), (low - prev_close).abs()], axis=1
    ).max(axis=1)
    tr.iloc[0] = high.iloc[0] - low.iloc[0]
    return tr


def atr_wilder(high: pd.Series, low: pd.Series, close: pd.Series, n: int = 14) -> pd.Series:
    tr = true_range(high, low, close).to_numpy(dtype=float)
    out = np.full(len(tr), np.nan)
    if len(tr) < n:
        return pd.Series(out, index=high.index)
    out[n - 1] = tr[:n].mean()
    for i in range(n, len(tr)):
        out[i] = (out[i - 1] * (n - 1) + tr[i]) / n
    return pd.Series(out, index=high.index)


def roc(s: pd.Series, n: int) -> pd.Series:
    return (s / s.shift(n) - 1.0) * 100.0


def roc_point(s: pd.Series, n: int) -> float | None:
    """ROC of the last value against the value n bars earlier; None if unavailable."""
    if len(s) <= n or n <= 0:
        return None
    base = float(s.iloc[-1 - n])
    if base <= 0 or np.isnan(base):
        return None
    return (float(s.iloc[-1]) / base - 1.0) * 100.0


REQUIRED_COLUMNS = ("open", "high", "low", "close", "volume")


def add_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Return a copy with ema10/20/50/200, sma150, atr14, vol20, vol50 columns."""
    out = df.copy()
    c = out["close"]
    out["ema10"] = ema(c, 10)
    out["ema20"] = ema(c, 20)
    out["ema50"] = ema(c, 50)
    out["ema200"] = ema(c, 200)
    out["sma150"] = sma(c, 150)
    out["atr14"] = atr_wilder(out["high"], out["low"], c, 14)
    out["vol20"] = sma(out["volume"].astype(float), 20)
    out["vol50"] = sma(out["volume"].astype(float), 50)
    return out


def resample_weekly(daily: pd.DataFrame) -> pd.DataFrame:
    """Build weekly OHLCV bars (weeks ending Friday, labelled by the week's last session)."""
    if daily.empty:
        return daily.copy()
    agg = daily[list(REQUIRED_COLUMNS)].resample("W-FRI").agg(
        {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}
    )
    agg = agg.dropna(subset=["close"])
    return agg


def weekly_trails(weekly: pd.DataFrame, ema_len: int, sma_len: int) -> tuple[float | None, float | None]:
    """Last weekly EMA(ema_len) and SMA(sma_len) of weekly closes. None when not enough bars."""
    if weekly is None or weekly.empty:
        return None, None
    c = weekly["close"]
    e = ema(c, ema_len).iloc[-1] if len(c) >= ema_len else float("nan")
    s = sma(c, sma_len).iloc[-1] if len(c) >= sma_len else float("nan")
    e_out = None if np.isnan(e) else float(e)
    s_out = None if np.isnan(s) else float(s)
    return e_out, s_out


def last(df: pd.DataFrame, col: str) -> float | None:
    if col not in df.columns or df.empty:
        return None
    v = df[col].iloc[-1]
    if v is None or (isinstance(v, float) and np.isnan(v)) or pd.isna(v):
        return None
    return float(v)
