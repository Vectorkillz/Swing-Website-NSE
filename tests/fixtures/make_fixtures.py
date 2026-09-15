"""Deterministic synthetic OHLCV fixtures.

Run `python tests/fixtures/make_fixtures.py` to (re)generate the CSVs in this folder.
Each fixture targets one detector path or edge case. Seeds are fixed, so output is stable.
The CSVs are committed; tests read the CSVs, not this script.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).parent
END = pd.Timestamp("2026-09-10")  # Thursday; fixture "session date"
N = 260


def bdays(n: int, end: pd.Timestamp = END) -> pd.DatetimeIndex:
    return pd.bdate_range(end=end, periods=n)


def bars_from_close(close: np.ndarray, rng: np.random.Generator, vol: np.ndarray, spread: float = 0.012) -> pd.DataFrame:
    n = len(close)
    open_ = np.empty(n)
    open_[0] = close[0]
    open_[1:] = close[:-1] * (1 + rng.normal(0, 0.002, n - 1))
    hi = np.maximum(open_, close) * (1 + np.abs(rng.normal(0, spread / 2, n)))
    lo = np.minimum(open_, close) * (1 - np.abs(rng.normal(0, spread / 2, n)))
    return pd.DataFrame({"open": open_, "high": hi, "low": lo, "close": close, "volume": vol.astype(int)}, index=bdays(n))


def write(name: str, df: pd.DataFrame) -> None:
    out = df.copy()
    out.index.name = "date"
    out.to_csv(HERE / f"{name}.csv", float_format="%.4f", lineterminator="\n", date_format="%Y-%m-%d")


def long_vcp_base(seed: int, leg_end_offset: int = 8, pullback: float = 0.09, tiny_last_range: bool = False,
                  mother_bar: bool = False, colour: bool = False, leg_drift: float = 0.0115) -> pd.DataFrame:
    """Uptrend base -> 22-bar leg of ~+25-30% -> pullback with drying volume -> last bar inside bar.

    The pullback is front-loaded (most of the drop in the first bars after the leg, then flat)
    so EMA20 catches up and the close sits on or above EMA20 x 0.99 at the last bar.
    """
    rng = np.random.default_rng(seed)
    n = N
    close = np.empty(n)
    close[0] = 100.0
    leg_end = n - 1 - leg_end_offset
    leg_start = leg_end - 21
    for i in range(1, n):
        if i < leg_start:
            close[i] = close[i - 1] * (1 + 0.0012 + rng.normal(0, 0.006))  # slow uptrend: stage 2
        elif i <= leg_end:
            close[i] = close[i - 1] * (1 + leg_drift + rng.normal(0, 0.004))
        else:
            close[i] = close[i - 1] * (1 + rng.normal(0, 0.003))
    leg_high = close[leg_start : leg_end + 1].max()
    target = leg_high * (1 - pullback)
    k = n - 1 - leg_end
    for j, i in enumerate(range(leg_end + 1, n), start=1):
        frac = min(1.0, (j / k) ** 0.35)  # front-loaded decline
        close[i] = close[leg_end] + (target - close[leg_end]) * frac + rng.normal(0, 0.1)
    vol = rng.integers(400_000, 600_000, n).astype(float)
    vol[leg_start : leg_end + 1] *= 2.2   # heavy leg volume
    vol[leg_end + 1 :] *= 0.55            # dry-up: ~ 25% of leg mean
    df = bars_from_close(close, rng, vol)
    # last bar inside the prior bar
    ph, pl = df["high"].iloc[-2], df["low"].iloc[-2]
    mid = (ph + pl) / 2
    if tiny_last_range:
        # prev bar low a hair below close -> PREV_LOW stop would be ~0.1% away
        c = df["close"].iloc[-1]
        df.iloc[-2, df.columns.get_loc("low")] = c * 0.999
        df.iloc[-2, df.columns.get_loc("high")] = c * 1.004
        df.iloc[-1, df.columns.get_loc("open")] = c * 1.0005
        df.iloc[-1, df.columns.get_loc("high")] = c * 1.002
        df.iloc[-1, df.columns.get_loc("low")] = c * 0.9995
    elif mother_bar:
        # bar -5: wide mother bar (range 10% of price). Bar -4 breaks the mother's high with a range
        # < 0.7 x mother range, so it is NOT an inside bar; bars -3..-1 step up (each high > prior high).
        c = df["close"].iloc[-5]
        col = df.columns.get_loc
        df.iloc[-5, col("high")] = c * 1.05
        df.iloc[-5, col("low")] = c * 0.95
        df.iloc[-5, col("open")] = c * 0.99
        df.iloc[-4, col("low")] = c * 1.0
        df.iloc[-4, col("open")] = c * 1.001
        df.iloc[-4, col("close")] = c * 1.045
        df.iloc[-4, col("high")] = c * 1.055
        for k2, i in enumerate(range(-3, 0), start=1):
            base = c * (1.045 + 0.004 * k2)
            df.iloc[i, col("open")] = base
            df.iloc[i, col("close")] = base * 1.003
            df.iloc[i, col("high")] = c * 1.055 + c * 0.004 * k2
            df.iloc[i, col("low")] = base * 0.999
    else:
        df.iloc[-1, df.columns.get_loc("high")] = mid + (ph - pl) * 0.3
        df.iloc[-1, df.columns.get_loc("low")] = mid - (ph - pl) * 0.3
        df.iloc[-1, df.columns.get_loc("open")] = mid - (ph - pl) * 0.1
        df.iloc[-1, df.columns.get_loc("close")] = mid + (ph - pl) * 0.1
    if colour:
        # two reds then a green, all within prior ranges is not required
        for i in (-3, -2):
            c = df["close"].iloc[i]
            df.iloc[i, df.columns.get_loc("open")] = c * 1.004
            df.iloc[i, df.columns.get_loc("high")] = c * 1.006
        c = df["close"].iloc[-1]
        df.iloc[-1, df.columns.get_loc("open")] = c * 0.996
        df.iloc[-1, df.columns.get_loc("low")] = c * 0.994
    return df


def short_base(seed: int, double_top: bool = False) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    n = N
    close = np.empty(n)
    close[0] = 500.0
    for i in range(1, n):
        if i < n - 120:
            close[i] = close[i - 1] * (1 + rng.normal(0, 0.005))
        else:
            close[i] = close[i - 1] * (1 - 0.004 + rng.normal(0, 0.004))  # ~120-bar decline
    vol = rng.integers(400_000, 600_000, n).astype(float)
    df = bars_from_close(close, rng, vol)
    hi = df["high"].to_numpy().copy()
    lo = df["low"].to_numpy().copy()
    o = df["open"].to_numpy().copy()
    c = df["close"].to_numpy().copy()
    # last 20 bars: fully deterministic, strictly lower highs and lower lows, all red candles,
    # open/close inside the bar range so the structure survives.
    base = c[n - 21]
    for i in range(n - 20, n):
        k = i - (n - 20)
        hi[i] = base * (1.01 - 0.002 * k)
        lo[i] = hi[i] * 0.985
        c[i] = lo[i] + (hi[i] - lo[i]) * 0.4
        o[i] = lo[i] + (hi[i] - lo[i]) * 0.7
    # weak bounce: with the last 20 bars declining, close[-1] < close[-10]; the bounce ratio is
    # negative, i.e. no bounce at all, which counts as weak.
    if double_top:
        # two peaks within 3%: bar -30 and bar -10 (the second breaks the alternating structure
        # on purpose so this fixture qualifies via double top, not downtrend)
        hi[n - 30] = c[n - 41] * 1.08
        hi[n - 10] = hi[n - 30] * 1.01
    df["open"], df["close"], df["high"], df["low"] = o, c, hi, lo
    df["high"] = np.maximum(df["high"], np.maximum(df["open"], df["close"]))
    df["low"] = np.minimum(df["low"], np.minimum(df["open"], df["close"]))
    vol[-5:] *= 0.5  # low-volume bounce
    df["volume"] = vol.astype(int)
    return df


def index_series(seed: int, kind: str) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    n = 520
    close = np.empty(n)
    close[0] = 20000.0
    drift = {"bull": 0.0006, "bear": -0.0012, "neutral": 0.0}[kind]
    for i in range(1, n):
        close[i] = close[i - 1] * (1 + drift + rng.normal(0, 0.004))
    if kind == "neutral":
        # end below EMA10 but above EMA20 -> neither bull nor bear
        close[-3:] = close[-4] * np.array([0.995, 0.990, 0.992])
    vol = rng.integers(1, 2, n).astype(float)
    df = bars_from_close(close, rng, vol, spread=0.006)
    return df


def main() -> None:
    write("long_vcp_ok", long_vcp_base(1))
    write("long_leg_stale", long_vcp_base(2, leg_end_offset=20, pullback=0.085))
    write("long_tiny_range_ib", long_vcp_base(3, tiny_last_range=True))
    write("long_mother_bar", long_vcp_base(4, mother_bar=True, pullback=0.18))
    write("long_colour_change", long_vcp_base(5, colour=True))
    write("long_no_pullback", long_vcp_base(6, pullback=0.02))
    write("short_stage4_downtrend", short_base(7))
    write("short_double_top", short_base(8, double_top=True))

    ok = long_vcp_base(9)
    bad = ok.copy()
    bad.iloc[-30, bad.columns.get_loc("low")] = 0.0
    write("edge_zero_price", bad)
    gap = ok.drop(ok.index[-20:-12])  # 8 missing sessions
    write("edge_gap_sessions", gap)
    write("edge_stale_last_bar", ok.iloc[:-3])
    write("edge_too_few_bars", ok.iloc[-80:])

    write("index_nifty_bull", index_series(11, "bull"))
    write("index_nifty_bear", index_series(12, "bear"))
    write("index_nifty_neutral", index_series(13, "neutral"))
    write("index_smallcap", index_series(14, "bull").iloc[-60:])


if __name__ == "__main__":
    main()
