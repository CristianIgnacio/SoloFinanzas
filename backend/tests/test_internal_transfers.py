import unittest
from datetime import date

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select
from tests.fixtures import Session

from app.domain.enums import CategoryType, TransactionType
from app.models.category import CategoryModel
from app.models.internal_transfer_match import InternalTransferMatchModel
from app.models.transaction import TransactionModel
from app.services.internal_transfers import refresh_internal_transfer_matches
from app.services.transactions import list_transactions, update_transaction_category


class InternalTransferMatchTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)

    def add_category(self, session: Session, name: str, type_: CategoryType) -> int:
        category = CategoryModel(name=name, type=type_, is_default=True)
        session.add(category)
        session.commit()
        session.refresh(category)
        return category.id

    def add_transaction(
        self,
        session: Session,
        *,
        account_id: int,
        transaction_date: date,
        amount: int,
        category_id: int | None = None,
    ) -> TransactionModel:
        transaction = TransactionModel(
            account_id=account_id,
            statement_id=1,
            date=transaction_date,
            description="Movimiento de prueba",
            normalized_description="movimiento de prueba",
            amount_clp=amount,
            transaction_type=(
                TransactionType.INCOME if amount >= 0 else TransactionType.EXPENSE
            ),
            category_id=category_id,
        )
        session.add(transaction)
        session.commit()
        session.refresh(transaction)
        return transaction

    def list_matches(self, session: Session) -> list[InternalTransferMatchModel]:
        return session.exec(
            select(InternalTransferMatchModel).order_by(
                InternalTransferMatchModel.id.asc()
            )
        ).all()

    def test_matches_same_day_and_next_day_internal_transfers(self) -> None:
        with Session(self.engine) as session:
            transfer_id = self.add_category(
                session, "Transferencias", CategoryType.TRANSFER
            )
            same_day_expense = self.add_transaction(
                session,
                account_id=1,
                transaction_date=date(2026, 1, 10),
                amount=-5000,
                category_id=transfer_id,
            )
            same_day_income = self.add_transaction(
                session,
                account_id=2,
                transaction_date=date(2026, 1, 10),
                amount=5000,
                category_id=transfer_id,
            )
            next_day_expense = self.add_transaction(
                session,
                account_id=1,
                transaction_date=date(2026, 1, 12),
                amount=-7000,
                category_id=transfer_id,
            )
            next_day_income = self.add_transaction(
                session,
                account_id=2,
                transaction_date=date(2026, 1, 13),
                amount=7000,
                category_id=transfer_id,
            )

            refresh_internal_transfer_matches(session)
            session.commit()
            matches = self.list_matches(session)
            expected_pairs = {
                (same_day_expense.id, same_day_income.id),
                (next_day_expense.id, next_day_income.id),
            }

        self.assertEqual(len(matches), 2)
        self.assertEqual(
            {
                (match.outgoing_transaction_id, match.incoming_transaction_id)
                for match in matches
            },
            expected_pairs,
        )
        self.assertEqual([match.date_gap_days for match in matches], [0, 1])

    def test_rejects_same_account_and_uncategorized_pairs(self) -> None:
        with Session(self.engine) as session:
            transfer_id = self.add_category(
                session, "Transferencias", CategoryType.TRANSFER
            )
            self.add_transaction(
                session,
                account_id=1,
                transaction_date=date(2026, 1, 10),
                amount=-5000,
                category_id=transfer_id,
            )
            self.add_transaction(
                session,
                account_id=1,
                transaction_date=date(2026, 1, 10),
                amount=5000,
            )
            self.add_transaction(
                session,
                account_id=2,
                transaction_date=date(2026, 1, 11),
                amount=-8000,
            )
            self.add_transaction(
                session,
                account_id=3,
                transaction_date=date(2026, 1, 11),
                amount=8000,
            )

            refresh_internal_transfer_matches(session)
            session.commit()

            matches = self.list_matches(session)

        self.assertEqual(matches, [])

    def test_matches_are_one_to_one_for_repeated_amounts(self) -> None:
        with Session(self.engine) as session:
            transfer_id = self.add_category(
                session, "Transferencias", CategoryType.TRANSFER
            )
            first_expense = self.add_transaction(
                session,
                account_id=1,
                transaction_date=date(2026, 1, 10),
                amount=-5000,
                category_id=transfer_id,
            )
            second_expense = self.add_transaction(
                session,
                account_id=3,
                transaction_date=date(2026, 1, 10),
                amount=-5000,
                category_id=transfer_id,
            )
            first_income = self.add_transaction(
                session,
                account_id=2,
                transaction_date=date(2026, 1, 10),
                amount=5000,
                category_id=transfer_id,
            )
            second_income = self.add_transaction(
                session,
                account_id=4,
                transaction_date=date(2026, 1, 11),
                amount=5000,
                category_id=transfer_id,
            )

            refresh_internal_transfer_matches(session)
            session.commit()

            matches = self.list_matches(session)
            expected_pairs = {
                (first_expense.id, first_income.id),
                (second_expense.id, second_income.id),
            }

        self.assertEqual(len(matches), 2)
        self.assertEqual(
            {
                (match.outgoing_transaction_id, match.incoming_transaction_id)
                for match in matches
            },
            expected_pairs,
        )

    def test_category_update_recalculates_matches(self) -> None:
        with Session(self.engine) as session:
            transfer_id = self.add_category(
                session, "Transferencias", CategoryType.TRANSFER
            )
            expense = self.add_transaction(
                session,
                account_id=1,
                transaction_date=date(2026, 1, 10),
                amount=-5000,
            )
            income = self.add_transaction(
                session,
                account_id=2,
                transaction_date=date(2026, 1, 10),
                amount=5000,
            )
            expense_id = expense.id
            income_id = income.id

            refresh_internal_transfer_matches(session)
            session.commit()
            self.assertEqual(self.list_matches(session), [])

            update_transaction_category(session, expense_id, transfer_id, "manual")
            self.assertEqual(self.list_matches(session), [])

            update_transaction_category(session, income_id, transfer_id, "manual")
            matches = self.list_matches(session)

        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0].outgoing_transaction_id, expense_id)
        self.assertEqual(matches[0].incoming_transaction_id, income_id)

    def test_list_transactions_marks_internal_transfer_members(self) -> None:
        with Session(self.engine) as session:
            transfer_id = self.add_category(
                session, "Transferencias", CategoryType.TRANSFER
            )
            expense = self.add_transaction(
                session,
                account_id=1,
                transaction_date=date(2026, 1, 10),
                amount=-5000,
                category_id=transfer_id,
            )
            income = self.add_transaction(
                session,
                account_id=2,
                transaction_date=date(2026, 1, 10),
                amount=5000,
                category_id=transfer_id,
            )
            regular = self.add_transaction(
                session,
                account_id=1,
                transaction_date=date(2026, 1, 11),
                amount=-3000,
            )
            expected_internal_ids = {expense.id, income.id}
            regular_id = regular.id

            refresh_internal_transfer_matches(session)
            session.commit()

            transactions = list_transactions(session, limit=10)

        internal_ids = {
            transaction.id
            for transaction in transactions
            if transaction.is_internal_transfer
        }
        self.assertEqual(internal_ids, expected_internal_ids)
        self.assertFalse(
            next(
                transaction
                for transaction in transactions
                if transaction.id == regular_id
            ).is_internal_transfer
        )

    def test_requires_transfer_category_on_both_sides(self) -> None:
        with Session(self.engine) as session:
            transfer_id = self.add_category(
                session, "Transferencias", CategoryType.TRANSFER
            )
            self.add_transaction(
                session,
                account_id=1,
                transaction_date=date(2026, 1, 10),
                amount=-5000,
                category_id=transfer_id,
            )
            self.add_transaction(
                session,
                account_id=2,
                transaction_date=date(2026, 1, 10),
                amount=5000,
            )

            refresh_internal_transfer_matches(session)
            session.commit()

            matches = self.list_matches(session)

        self.assertEqual(matches, [])

    def test_extends_window_only_across_weekend(self) -> None:
        with Session(self.engine) as session:
            transfer_id = self.add_category(
                session, "Transferencias", CategoryType.TRANSFER
            )
            friday_expense = self.add_transaction(
                session,
                account_id=1,
                transaction_date=date(2026, 1, 9),
                amount=-5000,
                category_id=transfer_id,
            )
            monday_income = self.add_transaction(
                session,
                account_id=2,
                transaction_date=date(2026, 1, 12),
                amount=5000,
                category_id=transfer_id,
            )
            friday_expense_id = friday_expense.id
            monday_income_id = monday_income.id
            self.add_transaction(
                session,
                account_id=3,
                transaction_date=date(2026, 1, 8),
                amount=-7000,
                category_id=transfer_id,
            )
            self.add_transaction(
                session,
                account_id=4,
                transaction_date=date(2026, 1, 10),
                amount=7000,
                category_id=transfer_id,
            )

            refresh_internal_transfer_matches(session)
            session.commit()
            matches = self.list_matches(session)

        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0].outgoing_transaction_id, friday_expense_id)
        self.assertEqual(matches[0].incoming_transaction_id, monday_income_id)
        self.assertEqual(matches[0].date_gap_days, 3)

    def test_extends_window_across_chilean_bank_holiday(self) -> None:
        with Session(self.engine) as session:
            transfer_id = self.add_category(
                session, "Transferencias", CategoryType.TRANSFER
            )
            expense = self.add_transaction(
                session,
                account_id=1,
                transaction_date=date(2026, 5, 20),
                amount=-20000,
                category_id=transfer_id,
            )
            income = self.add_transaction(
                session,
                account_id=2,
                transaction_date=date(2026, 5, 22),
                amount=20000,
                category_id=transfer_id,
            )
            expense_id = expense.id
            income_id = income.id

            refresh_internal_transfer_matches(session)
            session.commit()
            matches = self.list_matches(session)

        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0].outgoing_transaction_id, expense_id)
        self.assertEqual(matches[0].incoming_transaction_id, income_id)
        self.assertEqual(matches[0].date_gap_days, 2)


if __name__ == "__main__":
    unittest.main()
