from datetime import date
import unittest
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import event
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.core.tenancy import TenantSession
from app.domain.enums import AccountKind, CategoryType, TransactionOrigin, TransactionType
from app.models.account import AccountModel
from app.models.category import CategoryModel
from app.models.internal_transfer_match import InternalTransferMatchModel
from app.models.statement import StatementModel
from app.models.transaction import TransactionModel
from app.models.user import UserModel
from app.services.cash_balance import get_cash_balance
from app.services.cash_links import link_imported_transaction_to_cash, unlink_cash_transaction
from app.services.dashboard import build_dashboard_summary
from app.services.internal_transfers import refresh_internal_transfer_matches
from app.services.statements import delete_statement, get_statement_deletion_impact
from app.services.transactions import transaction_page, update_transaction_category
from app.api.routes.reports import account_totals


OWNER = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
OTHER = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")


class CashLinkTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool,
        )
        @event.listens_for(self.engine, "connect")
        def enable_foreign_keys(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")
        SQLModel.metadata.create_all(self.engine)
        with Session(self.engine) as session:
            session.add_all([UserModel(id=OWNER), UserModel(id=OTHER)])
            session.commit()
        with TenantSession(self.engine, user_id=OWNER) as session:
            bank = AccountModel(name="Banco", account_type="vista")
            cash = AccountModel(name="Efectivo", account_kind=AccountKind.CASH,
                                institution=None, account_type="efectivo")
            session.add_all([bank, cash])
            session.flush()
            root = CategoryModel(name="Transferencias", type=CategoryType.TRANSFER)
            session.add(root)
            session.flush()
            withdrawal_category = CategoryModel(name="Retiro de efectivo", type=CategoryType.TRANSFER,
                                                parent_id=root.id)
            deposit_category = CategoryModel(name="Depósito de efectivo", type=CategoryType.TRANSFER,
                                             parent_id=root.id)
            session.add_all([withdrawal_category, deposit_category])
            session.flush()
            statement = StatementModel(account_id=bank.id, file_name="a.pdf", file_type="pdf")
            session.add(statement)
            session.flush()
            withdrawal = TransactionModel(
                account_id=bank.id, statement_id=statement.id,
                date=date(2026, 10, 10), description="Giro", normalized_description="giro",
                amount_clp=-20_000, transaction_type=TransactionType.EXPENSE,
                category_id=withdrawal_category.id,
            )
            deposit = TransactionModel(
                account_id=bank.id, statement_id=statement.id,
                date=date(2026, 10, 11), description="Depósito", normalized_description="depósito",
                amount_clp=3_000, transaction_type=TransactionType.INCOME,
                category_id=deposit_category.id,
            )
            manual = TransactionModel(
                account_id=cash.id, statement_id=None, origin=TransactionOrigin.MANUAL,
                date=date(2026, 10, 11), description="Almuerzo", normalized_description="almuerzo",
                amount_clp=-5_000, transaction_type=TransactionType.EXPENSE,
            )
            session.add_all([withdrawal, deposit, manual])
            session.commit()
            self.withdrawal_id, self.deposit_id = withdrawal.id, deposit.id
            self.manual_id, self.cash_id, self.statement_id = manual.id, cash.id, statement.id
            self.withdrawal_category_id = withdrawal_category.id
            self.deposit_category_id = deposit_category.id

    def tearDown(self) -> None:
        self.engine.dispose()

    def test_withdrawal_and_deposit_are_reversible_and_persist_recalculation(self) -> None:
        with TenantSession(self.engine, user_id=OWNER) as session:
            linked = link_imported_transaction_to_cash(session, self.withdrawal_id)
            self.assertTrue(linked.cash_transfer_linked)
            self.assertTrue(linked.is_internal_transfer)
            counterpart = session.exec(select(TransactionModel).where(
                TransactionModel.origin == TransactionOrigin.CASH_TRANSFER,
            )).one()
            self.assertEqual((counterpart.amount_clp, counterpart.date), (20_000, date(2026, 10, 10)))
            self.assertEqual(get_cash_balance(session).balance_clp, 15_000)
            with self.assertRaises(HTTPException) as error:
                link_imported_transaction_to_cash(session, self.withdrawal_id)
            self.assertEqual(error.exception.status_code, 409)
            refresh_internal_transfer_matches(session)
            session.commit()
            self.assertEqual(session.exec(select(InternalTransferMatchModel)).one().match_kind, "cash")
            self.assertTrue(update_transaction_category(
                session, self.withdrawal_id, None,
            ).cash_transfer_linked)
            visible = transaction_page(session)["items"]
            self.assertEqual({row.id for row in visible if row.cash_transfer_linked},
                             {self.withdrawal_id, counterpart.id})
            consolidated = transaction_page(session, exclude_internal=True)["items"]
            self.assertEqual({row.id for row in consolidated}, {self.deposit_id, self.manual_id})
            dashboard = build_dashboard_summary(session, requested_period="2026-10")
            self.assertEqual(dashboard.cards[0].value, "$-2.000")
            totals = {row["account_id"]: row for row in account_totals(session)}
            bank_id = session.get(TransactionModel, self.withdrawal_id).account_id
            self.assertEqual((totals[bank_id]["income"], totals[bank_id]["expenses"], totals[bank_id]["net"]),
                             (3_000, 0, -17_000))
            self.assertEqual((totals[self.cash_id]["income"], totals[self.cash_id]["expenses"], totals[self.cash_id]["net"]),
                             (0, 5_000, 15_000))

            unlinked = unlink_cash_transaction(session, counterpart.id)
            self.assertFalse(unlinked.cash_transfer_linked)
            self.assertIsNone(session.get(TransactionModel, counterpart.id))
            self.assertIsNotNone(session.get(TransactionModel, self.withdrawal_id))
            self.assertEqual(get_cash_balance(session).balance_clp, -5_000)

            link_imported_transaction_to_cash(session, self.deposit_id)
            counterpart = session.exec(select(TransactionModel).where(
                TransactionModel.origin == TransactionOrigin.CASH_TRANSFER,
            )).one()
            self.assertEqual(counterpart.amount_clp, -3_000)
            self.assertEqual(counterpart.date, date(2026, 10, 11))
            unlink_cash_transaction(session, self.deposit_id)
            self.assertIsNone(session.get(TransactionModel, counterpart.id))

    def test_deleting_statement_removes_only_linked_cash_counterpart(self) -> None:
        with TenantSession(self.engine, user_id=OWNER) as session:
            link_imported_transaction_to_cash(session, self.withdrawal_id)
            impact = get_statement_deletion_impact(session, self.statement_id)
            self.assertEqual(impact.cash_counterpart_count, 1)
            result = delete_statement(session, self.statement_id)
            self.assertEqual(result.cash_counterpart_count, 1)
            self.assertIsNone(session.get(TransactionModel, self.withdrawal_id))
            self.assertIsNotNone(session.get(TransactionModel, self.manual_id))
            self.assertEqual(session.exec(select(TransactionModel).where(
                TransactionModel.origin == TransactionOrigin.CASH_TRANSFER,
            )).all(), [])
            self.assertEqual(get_cash_balance(session).balance_clp, -5_000)

    def test_other_user_cannot_link_or_unlink(self) -> None:
        with TenantSession(self.engine, user_id=OWNER) as session:
            link_imported_transaction_to_cash(session, self.withdrawal_id)
        with TenantSession(self.engine, user_id=OTHER) as session:
            with self.assertRaises(HTTPException) as error:
                link_imported_transaction_to_cash(session, self.deposit_id)
            self.assertEqual(error.exception.status_code, 404)
            with self.assertRaises(HTTPException) as error:
                unlink_cash_transaction(session, self.withdrawal_id)
            self.assertEqual(error.exception.status_code, 404)

    def test_requires_matching_cash_category_and_direction(self) -> None:
        with TenantSession(self.engine, user_id=OWNER) as session:
            for category_id in (None, self.deposit_category_id):
                update_transaction_category(session, self.withdrawal_id, category_id)
                with self.assertRaises(HTTPException) as error:
                    link_imported_transaction_to_cash(session, self.withdrawal_id)
                self.assertEqual(error.exception.status_code, 409)
            update_transaction_category(session, self.withdrawal_id, self.withdrawal_category_id)
            category = session.get(CategoryModel, self.withdrawal_category_id)
            category.is_active = False
            session.add(category)
            session.commit()
            with self.assertRaises(HTTPException) as error:
                link_imported_transaction_to_cash(session, self.withdrawal_id)
            self.assertEqual(error.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
