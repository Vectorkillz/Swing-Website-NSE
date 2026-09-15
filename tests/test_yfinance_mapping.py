"""Unit normalisation at the yfinance boundary, tested with a fake yfinance module (no network)."""

import sys
import types

import pytest


class _FakeTicker:
    def __init__(self, info):
        self.info = info


def _provider(info):
    fake = types.SimpleNamespace(Ticker=lambda t: _FakeTicker(info), download=None)
    sys.modules["yfinance"] = fake  # type: ignore[assignment]
    from ingestion.yfinance_provider import YFinanceProvider

    p = YFinanceProvider(info_pause_s=0)
    p.yf = fake
    return p


def test_units_normalised():
    p = _provider({"marketCap": 1.7e12, "debtToEquity": 36.65, "returnOnEquity": 0.083, "revenueGrowth": 0.297, "earningsGrowth": -0.224, "freeCashflow": -5.0, "averageVolume": 12089246, "sector": "Energy"})
    f = p.fetch("RELIANCE")
    assert f.market_cap_cr == pytest.approx(170000.0)
    assert f.debt_equity == pytest.approx(0.3665)  # percent -> ratio
    assert f.roe == pytest.approx(8.3) and f.roe_source == "returnOnEquity"
    assert f.revenue_growth == pytest.approx(29.7)
    assert f.eps_growth == pytest.approx(-22.4)
    assert f.fcf_positive is False


def test_missing_fields_stay_none_and_roe_derived():
    p = _provider({"marketCap": 5e11, "netIncomeToCommon": 1.0e10, "bookValue": 100.0, "sharesOutstanding": 1.0e9})
    f = p.fetch("X")
    assert f.debt_equity is None and f.fcf_positive is None and f.revenue_growth is None
    assert f.roe == pytest.approx(10.0) and f.roe_source.startswith("derived:")


def test_roe_not_derived_without_inputs():
    p = _provider({"marketCap": 5e11, "netIncomeToCommon": 1.0e10, "bookValue": 0.0})
    f = p.fetch("X")
    assert f.roe is None and f.roe_source is None
