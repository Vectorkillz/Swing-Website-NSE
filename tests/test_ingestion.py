"""Store, calendar, CSV providers and symbol mapping. No network."""

from datetime import date, datetime, timezone

import pandas as pd
import pytest

from engine.types import Fundamentals
from ingestion.calendar import IST, NseCalendar
from ingestion.csv_providers import CsvBanListProvider, CsvUniverseProvider
from ingestion.protocols import BanListSnapshot, UniverseRow, UniverseSnapshot
from ingestion.store import FundamentalsStore, OhlcvStore
from ingestion.symbols import nse_to_yf, yf_to_nse


def bars(start, n, price=100.0):
    idx = pd.bdate_range(start, periods=n)
    return pd.DataFrame({"open": price, "high": price + 1, "low": price - 1, "close": price, "volume": 1000}, index=idx)


def test_merge_keeps_existing_rows_and_appends_delta(tmp_path):
    store = OhlcvStore(tmp_path, lookback_days=3650)
    store.merge("X", bars("2026-01-01", 10, 100.0), date(2026, 1, 14))
    new = bars("2026-01-12", 5, 200.0)  # overlaps the last 3 sessions (12, 13, 14 Jan)
    new.loc[new.index[:3], "close"] = 100.0  # same closes on overlap -> not divergent
    r = store.merge("X", new, date(2026, 1, 20))
    df = store.load("X")
    assert r["added"] == 2 and not r["divergent"]
    assert df["close"].iloc[9] == 100.0  # existing row won
    assert df["close"].iloc[-1] == 200.0


def test_merge_flags_divergence_and_force_overwrites(tmp_path):
    store = OhlcvStore(tmp_path, lookback_days=3650)
    store.merge("X", bars("2026-01-01", 10, 100.0), date(2026, 1, 14))
    r = store.merge("X", bars("2026-01-12", 3, 50.0), date(2026, 1, 14))
    assert r["divergent"]
    assert store.load("X")["close"].iloc[-1] == 100.0
    store.merge("X", bars("2026-01-01", 10, 50.0), date(2026, 1, 14), force=True)
    assert store.load("X")["close"].iloc[-1] == 50.0


def test_merge_prunes_to_lookback_and_drops_future(tmp_path):
    store = OhlcvStore(tmp_path, lookback_days=10)
    store.merge("X", bars("2026-01-01", 30, 100.0), date(2026, 1, 20))
    df = store.load("X")
    assert pd.Timestamp(df.index[-1]).date() <= date(2026, 1, 20)
    assert pd.Timestamp(df.index[0]).date() >= date(2026, 1, 10)


def test_delta_start(tmp_path):
    store = OhlcvStore(tmp_path, lookback_days=3650)
    assert store.delta_start("X", date(2020, 1, 1)) == date(2020, 1, 1)
    store.merge("X", bars("2026-01-01", 10, 100.0), date(2026, 1, 14))
    assert store.delta_start("X", date(2020, 1, 1)) < date(2026, 1, 14)


def test_fundamentals_store_ttl(tmp_path):
    store = FundamentalsStore(tmp_path, ttl_hours=24)
    now = datetime(2026, 9, 10, 12, tzinfo=timezone.utc)
    store.save("X", Fundamentals(roe=12.0, fetched_at="2026-09-10T10:00:00+00:00"))
    assert store.is_fresh("X", now)
    store.save("X", Fundamentals(roe=12.0, fetched_at="2026-09-08T10:00:00+00:00"))
    assert not store.is_fresh("X", now)
    assert store.load("X").roe == 12.0 and store.load("X").debt_equity is None


def test_calendar(tmp_path):
    (tmp_path / "nse_holidays_2026.csv").write_text("date,description\n2026-10-02,Gandhi Jayanti\n", encoding="utf-8")
    cal = NseCalendar(tmp_path)
    assert cal.is_trading_day(date(2026, 9, 10))
    assert not cal.is_trading_day(date(2026, 9, 12))  # Saturday
    assert not cal.is_trading_day(date(2026, 10, 2))
    assert cal.previous_trading_day(date(2026, 10, 5)) == date(2026, 10, 1)
    before_close = datetime(2026, 9, 10, 15, 0, tzinfo=IST)
    after_close = datetime(2026, 9, 10, 16, 30, tzinfo=IST)
    assert cal.expected_last_session(before_close) == date(2026, 9, 9)
    assert cal.expected_last_session(after_close) == date(2026, 9, 10)
    assert cal.has_year(2026) and not cal.has_year(2027)


def test_csv_universe_roundtrip(tmp_path):
    prov = CsvUniverseProvider(tmp_path)
    assert prov.fetch() is None
    snap = UniverseSnapshot((UniverseRow("RELIANCE", "Reliance", "Energy"), UniverseRow("TCS")), date(2026, 9, 1), "live")
    prov.save(snap, live_error=None)
    back = prov.fetch()
    assert back.symbols == ["RELIANCE", "TCS"] and back.as_of == date(2026, 9, 1) and back.source == "live"


def test_csv_ban_list_exact_date_only(tmp_path):
    prov = CsvBanListProvider(tmp_path)
    prov.save(BanListSnapshot(frozenset({"ABC"}), date(2026, 9, 10), "live", "ok"))
    assert prov.fetch(date(2026, 9, 10)).symbols == frozenset({"ABC"})
    assert prov.fetch(date(2026, 9, 11)) is None  # yesterday's list is not authoritative for today


def test_symbol_mapping():
    assert nse_to_yf("M&M") == "M%26M.NS"
    assert nse_to_yf("^NSEI") == "^NSEI"
    assert yf_to_nse("M%26M.NS") == "M&M"
