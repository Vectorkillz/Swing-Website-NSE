"""NSE trading calendar from committed holiday CSVs (data/calendar/nse_holidays_YYYY.csv: date,description)."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

import pandas as pd

IST = timezone(timedelta(hours=5, minutes=30))
SESSION_CLOSE = time(15, 30)
DATA_READY = time(15, 45)  # yfinance usually has the closing bar by then


class NseCalendar:
    def __init__(self, calendar_dir: Path):
        self.dir = calendar_dir
        self._holidays: set[date] = set()
        self._years: set[int] = set()
        for p in sorted(calendar_dir.glob("nse_holidays_*.csv")):
            df = pd.read_csv(p)
            for d in pd.to_datetime(df["date"]).dt.date:
                self._holidays.add(d)
            self._years.add(int(p.stem.rsplit("_", 1)[1]))

    def has_year(self, year: int) -> bool:
        return year in self._years

    def is_trading_day(self, d: date) -> bool:
        return d.weekday() < 5 and d not in self._holidays

    def previous_trading_day(self, d: date) -> date:
        d = d - timedelta(days=1)
        while not self.is_trading_day(d):
            d -= timedelta(days=1)
        return d

    def expected_last_session(self, now: datetime | None = None) -> date:
        """The session whose closing bar should be available right now (IST)."""
        now = (now or datetime.now(timezone.utc)).astimezone(IST)
        today = now.date()
        if self.is_trading_day(today) and now.time() >= DATA_READY:
            return today
        return self.previous_trading_day(today)
