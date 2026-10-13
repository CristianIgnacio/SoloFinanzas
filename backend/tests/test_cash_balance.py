from datetime import date
import unittest
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.api.routes.reports import account_totals
from app.core.tenancy import TenantSession
from app.domain.enums import AccountKind, TransactionOrigin, TransactionType
from app.models.account import AccountModel
from app.models.transaction import TransactionModel
from app.models.user import UserModel
from app.services.cash_balance import (
    CashOpeningBalanceInput, clear_cash_opening_balance, get_cash_balance,
    set_cash_opening_balance,
)


OWNER = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
OTHER = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")


class CashBalanceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)
        with Session(self.engine) as session:
            session.add_all([UserModel(id=OWNER), UserModel(id=OTHER)])
            session.commit()
        with TenantSession(self.engine, user_id=OWNER) as session:
            cash = AccountModel(
                name="Efectivo", account_kind=AccountKind.CASH,
                institution=None, account_type="efectivo",
            )
            bank = AccountModel(name="Banco", account_type="vista")
            session.add_all([cash, bank])
            session.flush()
            self.cash_id, self.bank_id = cash.id, bank.id
            for day, amount in [(9, -100), (10, 200), (11, -50)]:
                session.add(TransactionModel(
                    account_id=cash.id, statement_id=None, origin=TransactionOrigin.MANUAL,
                    date=date(2026, 10, day), description=f"Movimiento {day}",
                    normalized_description=f"movimiento {day}", amount_clp=amount,
                    transaction_type=TransactionType.INCOME if amount > 0 else TransactionType.EXPENSE,
                ))
            session.commit()

    def tearDown(self) -> None:
        self.engine.dispose()

    def test_inclusive_date_and_reports_unchanged(self) -> None:
        with TenantSession(self.engine, user_id=OWNER) as session:
            initial = get_cash_balance(session)
            self.assertEqual((initial.movements_clp, initial.balance_clp), (50, 50))
            report_before = account_totals(session)

            configured = set_cash_opening_balance(session, CashOpeningBalanceInput(
                amount_clp=1000, date=date(2026, 10, 10),
            ))
            self.assertEqual((configured.movements_clp, configured.balance_clp), (150, 1150))
            self.assertEqual(account_totals(session), report_before)
            self.assertEqual(next(row for row in report_before if row["account_id"] == self.cash_id), {
                "account_id": self.cash_id, "count": 3, "net": 50,
                "income": 200, "expenses": 150,
            })
            self.assertEqual(session.get(AccountModel, self.bank_id).opening_balance_clp, None)

            corrected = set_cash_opening_balance(session, CashOpeningBalanceInput(
                amount_clp=0, date=date(2026, 10, 11),
            ))
            self.assertEqual((corrected.movements_clp, corrected.balance_clp), (-50, -50))
            self.assertTrue(corrected.is_negative)
            self.assertEqual(account_totals(session), report_before)

            cleared = clear_cash_opening_balance(session)
            self.assertEqual((cleared.opening_balance_clp, cleared.opening_balance_date), (None, None))
            self.assertEqual((cleared.movements_clp, cleared.balance_clp), (50, 50))

    def test_owner_and_account_rules(self) -> None:
        with TenantSession(self.engine, user_id=OTHER) as session:
            with self.assertRaises(HTTPException) as error:
                set_cash_opening_balance(session, CashOpeningBalanceInput(
                    amount_clp=999, date=date(2026, 10, 10),
                ))
            self.assertEqual(error.exception.status_code, 404)
            self.assertIsNone(session.get(AccountModel, self.cash_id))

        with TenantSession(self.engine, user_id=OWNER) as session:
            bank = session.get(AccountModel, self.bank_id)
            bank.opening_balance_clp = 100
            bank.opening_balance_date = date(2026, 10, 10)
            session.add(bank)
            with self.assertRaises(HTTPException):
                session.flush()


if __name__ == "__main__":
    unittest.main()
