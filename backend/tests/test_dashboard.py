import unittest
from datetime import date, timedelta

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.domain.enums import CategoryType, TransactionType
from app.models.category import CategoryModel
from app.models.transaction import TransactionModel
from app.services.dashboard import build_dashboard_summary
from app.services.internal_transfers import refresh_internal_transfer_matches


class DashboardSummaryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)

    def add_category(self, name: str, type_: CategoryType) -> int:
        with Session(self.engine) as session:
            category = CategoryModel(name=name, type=type_, is_default=True)
            session.add(category)
            session.commit()
            session.refresh(category)
            return category.id

    def add_transaction(
        self,
        transaction_date: date,
        amount: int,
        account_id: int = 1,
        category_id: int | None = None,
    ) -> None:
        with Session(self.engine) as session:
            session.add(
                TransactionModel(
                    account_id=account_id,
                    statement_id=1,
                    date=transaction_date,
                    description="Movimiento de prueba",
                    normalized_description="movimiento de prueba",
                    amount_clp=amount,
                    transaction_type=(
                        TransactionType.INCOME
                        if amount >= 0
                        else TransactionType.EXPENSE
                    ),
                    category_id=category_id,
                )
            )
            session.commit()

    def test_uses_current_month_when_it_has_transactions(self) -> None:
        today = date.today()
        previous_month = today.replace(day=1) - timedelta(days=1)
        self.add_transaction(previous_month, 1000)
        self.add_transaction(today, 2000)

        with Session(self.engine) as session:
            summary = build_dashboard_summary(session)

        self.assertEqual(summary.period_month, today.strftime("%Y-%m"))
        self.assertEqual(
            summary.available_periods,
            [today.strftime("%Y-%m"), previous_month.strftime("%Y-%m")],
        )
        self.assertEqual(summary.cards[1].value, "$2.000")
        self.assertEqual(summary.cards[1].trend, "Subio $1.000 vs mes anterior")
        self.assertEqual(len(summary.monthly_movements), 12)
        self.assertEqual(summary.monthly_movements[-1].month, today.strftime("%Y-%m"))
        self.assertEqual(summary.monthly_movements[-1].income, 2000)

    def test_uses_latest_available_month_when_current_month_is_empty(self) -> None:
        latest_date = date.today().replace(day=1) - timedelta(days=1)
        older_date = latest_date.replace(day=1) - timedelta(days=1)
        self.add_transaction(older_date, 1000)
        self.add_transaction(latest_date, 3000)

        with Session(self.engine) as session:
            summary = build_dashboard_summary(session)

        self.assertEqual(summary.period_month, latest_date.strftime("%Y-%m"))
        self.assertEqual(summary.cards[1].value, "$3.000")
        self.assertEqual(summary.monthly_movements[-1].month, latest_date.strftime("%Y-%m"))

    def test_uses_requested_registered_period(self) -> None:
        latest_date = date.today().replace(day=1) - timedelta(days=1)
        older_date = latest_date.replace(day=1) - timedelta(days=1)
        self.add_transaction(older_date, 1000)
        self.add_transaction(latest_date, 3000)

        with Session(self.engine) as session:
            summary = build_dashboard_summary(
                session,
                requested_period=older_date.strftime("%Y-%m"),
            )

        self.assertEqual(summary.period_month, older_date.strftime("%Y-%m"))
        self.assertEqual(summary.cards[1].value, "$1.000")
        self.assertEqual(summary.monthly_movements[-1].month, older_date.strftime("%Y-%m"))

    def test_excludes_persisted_internal_transfer_matches(self) -> None:
        transfer_category_id = self.add_category(
            "Transferencias",
            CategoryType.TRANSFER,
        )
        transaction_date = date(2026, 1, 10)
        self.add_transaction(
            transaction_date,
            -5000,
            account_id=1,
            category_id=transfer_category_id,
        )
        self.add_transaction(
            transaction_date,
            5000,
            account_id=2,
            category_id=transfer_category_id,
        )
        self.add_transaction(transaction_date, -3000, account_id=1)
        self.add_transaction(transaction_date, 10000, account_id=2)

        with Session(self.engine) as session:
            refresh_internal_transfer_matches(session)
            session.commit()
            summary = build_dashboard_summary(
                session,
                requested_period="2026-01",
            )

        self.assertEqual(summary.cards[1].value, "$10.000")
        self.assertEqual(summary.cards[2].value, "$-3.000")
        self.assertEqual(summary.monthly_movements[-1].income, 10000)
        self.assertEqual(summary.monthly_movements[-1].expenses, 3000)


if __name__ == "__main__":
    unittest.main()
