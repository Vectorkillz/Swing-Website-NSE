"""Indicators checked against hand-computed values (no TA library involved)."""

import numpy as np
import pandas as pd
import pytest

from engine.indicators import atr_wilder, ema, resample_weekly, roc, roc_point, sma, true_range, weekly_trails

CLOSE = pd.Series([10.0, 11.0, 12.0, 11.0, 13.0, 14.0, 13.0, 15.0, 16.0, 15.0])


def test_sma_hand_values():
    s = sma(CLOSE, 3)
    assert np.isnan(s.iloc[0]) and np.isnan(s.iloc[1])
    assert s.iloc[2] == pytest.approx((10 + 11 + 12) / 3)
    assert s.iloc[-1] == pytest.approx((15 + 16 + 15) / 3)


def test_ema_seed_and_recursion():
    e = ema(CLOSE, 3)
    alpha = 2 / 4
    assert np.isnan(e.iloc[1])
    assert e.iloc[2] == pytest.approx(11.0)  # SMA seed
    assert e.iloc[3] == pytest.approx(alpha * 11 + (1 - alpha) * 11.0)
    assert e.iloc[4] == pytest.approx(alpha * 13 + (1 - alpha) * e.iloc[3])


def test_ema_too_short_is_all_nan():
    assert ema(CLOSE.iloc[:2], 3).isna().all()


def test_true_range_and_wilder_atr():
    high = pd.Series([12.0, 13.0, 12.5, 14.0, 15.0])
    low = pd.Series([10.0, 11.0, 11.5, 12.0, 13.5])
    close = pd.Series([11.0, 12.0, 12.0, 13.5, 14.0])
    tr = true_range(high, low, close)
    # bar0: h-l = 2; bar1: max(2, |13-11|=2, |11-11|=0)=2; bar2: max(1, .5, .5)=1; bar3: max(2, 2, 0)=2; bar4: max(1.5, 1.5, 0)=1.5
    assert tr.tolist() == pytest.approx([2.0, 2.0, 1.0, 2.0, 1.5])
    atr = atr_wilder(high, low, close, 3)
    assert np.isnan(atr.iloc[1])
    assert atr.iloc[2] == pytest.approx(5 / 3)  # SMA seed of first 3 TR
    assert atr.iloc[3] == pytest.approx((5 / 3 * 2 + 2.0) / 3)
    assert atr.iloc[4] == pytest.approx((atr.iloc[3] * 2 + 1.5) / 3)


def test_roc():
    r = roc(CLOSE, 2)
    assert r.iloc[2] == pytest.approx(20.0)  # 12/10 - 1
    assert roc_point(CLOSE, 1) == pytest.approx((15 / 16 - 1) * 100)
    assert roc_point(CLOSE, 2) == pytest.approx(0.0)
    assert roc_point(CLOSE, 50) is None


def test_weekly_resample_and_trails():
    idx = pd.bdate_range("2026-01-05", periods=250)  # 50 weeks
    df = pd.DataFrame({"open": 1.0, "high": 2.0, "low": 0.5, "close": np.linspace(100, 200, 250), "volume": 10}, index=idx)
    w = resample_weekly(df)
    assert len(w) == 50
    assert w["volume"].iloc[0] == 50
    assert w["close"].iloc[-1] == pytest.approx(200.0)
    e, s = weekly_trails(w, 20, 30)
    assert e is not None and s is not None and e > s  # rising series: shorter average is higher
    e2, s2 = weekly_trails(w.iloc[-15:], 20, 30)
    assert e2 is None and s2 is None
