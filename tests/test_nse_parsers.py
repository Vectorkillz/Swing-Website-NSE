from datetime import date

from ingestion.csv_providers import applicable
from ingestion.nse_live_provider import parse_mktlots, parse_secban
from ingestion.protocols import BanListSnapshot

MKTLOTS = """UNDERLYING                          ,SYMBOL    ,SEP-26     ,OCT-26     ,NOV-26
NIFTY 50                            ,NIFTY     ,65         ,65         ,65
Derivatives on Individual Securities,          ,           ,           ,
Reliance Industries Limited         ,RELIANCE  ,500        ,500        ,500
Mahindra & Mahindra Limited         ,M&M       ,350        ,350        ,350
"""

SECBAN = """Securities in Ban For Trade Date 15-SEP-2026:
1,BANDHANBNK
2,INOXWIND
3,KAYNES
"""


def test_parse_mktlots_skips_indices_and_reads_lot_size():
    rows = parse_mktlots(MKTLOTS)
    assert [r.symbol for r in rows] == ["RELIANCE", "M&M"]
    assert rows[0].lot_size == 500 and rows[0].name == "Reliance Industries Limited"


def test_parse_secban():
    d, syms = parse_secban(SECBAN)
    assert d == date(2026, 9, 15)
    assert syms == frozenset({"BANDHANBNK", "INOXWIND", "KAYNES"})


def test_parse_secban_empty_list():
    d, syms = parse_secban("Securities in Ban For Trade Date 16-SEP-2026:\n")
    assert d == date(2026, 9, 16) and syms == frozenset()


def test_ban_list_applicability_window():
    snap = BanListSnapshot(frozenset(), date(2026, 9, 15), "live", "ok")
    assert applicable(snap, date(2026, 9, 12))  # Saturday run for Friday session -> Monday list applies
    assert applicable(snap, date(2026, 9, 15))
    assert not applicable(snap, date(2026, 9, 16))  # yesterday's list never applies to today
    assert not applicable(snap, date(2026, 9, 1))
