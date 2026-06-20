from __future__ import annotations

from datetime import date


# Calendario local para que la categorizacion no dependa de una API externa.
# Debe revisarse anualmente e incorporar feriados extraordinarios cuando apliquen.
CHILEAN_BANK_HOLIDAYS = frozenset(
    {
        # 2025
        date(2025, 1, 1),
        date(2025, 4, 18),
        date(2025, 4, 19),
        date(2025, 5, 1),
        date(2025, 5, 21),
        date(2025, 6, 20),
        date(2025, 6, 29),
        date(2025, 7, 16),
        date(2025, 8, 15),
        date(2025, 9, 18),
        date(2025, 9, 19),
        date(2025, 10, 12),
        date(2025, 10, 31),
        date(2025, 11, 1),
        date(2025, 12, 8),
        date(2025, 12, 25),
        date(2025, 12, 31),
        # 2026
        date(2026, 1, 1),
        date(2026, 4, 3),
        date(2026, 4, 4),
        date(2026, 5, 1),
        date(2026, 5, 21),
        date(2026, 6, 21),
        date(2026, 6, 29),
        date(2026, 7, 16),
        date(2026, 8, 15),
        date(2026, 9, 18),
        date(2026, 9, 19),
        date(2026, 10, 12),
        date(2026, 10, 31),
        date(2026, 11, 1),
        date(2026, 12, 8),
        date(2026, 12, 25),
        date(2026, 12, 31),
    }
)

SUPPORTED_HOLIDAY_YEARS = frozenset(day.year for day in CHILEAN_BANK_HOLIDAYS)


def is_chilean_bank_business_day(day: date) -> bool:
    """Indica si una fecha es habil bancaria en el calendario configurado."""
    if day.weekday() >= 5:
        return False
    return day not in CHILEAN_BANK_HOLIDAYS

