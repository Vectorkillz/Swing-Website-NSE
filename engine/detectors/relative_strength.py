"""Relative strength versus an index: symbol ROC(n) minus index ROC(n), in percentage points."""

from __future__ import annotations

import pandas as pd

from ..indicators import roc_point


def rs_vs_index(symbol_close: pd.Series, index_close: pd.Series | None, n: int) -> float | None:
    if index_close is None:
        return None
    a = roc_point(symbol_close, n)
    b = roc_point(index_close, n)
    if a is None or b is None:
        return None
    return a - b
