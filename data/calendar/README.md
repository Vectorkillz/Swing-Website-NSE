# NSE holiday calendar

One CSV per year: `nse_holidays_YYYY.csv` with columns `date,description`.

The committed 2026 file lists only the fixed national holidays. **Fill it from the official
NSE trading holiday list** (nseindia.com → Resources → Exchange Communication → Holidays)
so the scheduled scan skips market holidays such as Holi, Diwali and Eid.

A missed holiday is a safe failure: ingestion finds no new bar, every symbol fails the
`stale_last_bar` quality gate, and the run is recorded as `degraded` rather than producing plans
from stale data.
