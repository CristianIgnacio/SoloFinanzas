import unittest
from datetime import date

from app.services.chilean_business_calendar import (
    SUPPORTED_HOLIDAY_YEARS,
    is_chilean_bank_business_day,
)


class ChileanBusinessCalendarTests(unittest.TestCase):
    def test_recognizes_weekends_and_configured_bank_holidays(self) -> None:
        self.assertFalse(is_chilean_bank_business_day(date(2026, 5, 16)))
        self.assertFalse(is_chilean_bank_business_day(date(2026, 5, 21)))
        self.assertTrue(is_chilean_bank_business_day(date(2026, 5, 22)))

    def test_unknown_year_falls_back_to_weekdays(self) -> None:
        self.assertNotIn(2030, SUPPORTED_HOLIDAY_YEARS)
        self.assertTrue(is_chilean_bank_business_day(date(2030, 5, 21)))
        self.assertFalse(is_chilean_bank_business_day(date(2030, 5, 18)))


if __name__ == "__main__":
    unittest.main()
