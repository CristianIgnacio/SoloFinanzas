from datetime import date
import unittest
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.core.tenancy import TenantSession
from app.api.routes.reports import account_totals
from app.domain.enums import AccountKind, CategoryType, TransactionOrigin, TransactionType
from app.models.account import AccountModel
from app.models.category import CategoryModel
from app.models.statement import StatementModel
from app.models.transaction import TransactionModel
from app.models.user import UserModel
from app.schemas.transaction import ManualTransactionInput
from app.services.cash_transactions import (
    create_manual_transaction, delete_manual_transaction, update_manual_transaction,
)
from app.services.transactions import update_transaction_category


OWNER = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
OTHER = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")


class CashTransactionTests(unittest.TestCase):
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
            income = CategoryModel(name="Sueldo", type=CategoryType.INCOME)
            expense = CategoryModel(name="Comida", type=CategoryType.EXPENSE)
            transfer = CategoryModel(name="Transferencia", type=CategoryType.TRANSFER)
            session.add_all([cash, bank, income, expense, transfer])
            session.flush()
            statement = StatementModel(account_id=bank.id, file_name="a.pdf", file_type="pdf")
            session.add(statement)
            session.commit()
            self.cash_id, self.bank_id = cash.id, bank.id
            self.income_id, self.expense_id = income.id, expense.id
            self.transfer_id = transfer.id
            self.statement_id = statement.id

    def tearDown(self) -> None:
        self.engine.dispose()

    def test_create_edit_delete_and_category_validation(self) -> None:
        with TenantSession(self.engine, user_id=OWNER) as session:
            created = create_manual_transaction(session, ManualTransactionInput(
                transaction_type=TransactionType.EXPENSE, amount_clp=1500,
                date=date(2026, 10, 12), description="  Café   y pan  ",
                category_id=self.expense_id,
            ))
            self.assertEqual(created.amount_clp, -1500)
            self.assertEqual(created.origin, TransactionOrigin.MANUAL)
            self.assertIsNone(created.statement_id)
            self.assertEqual(created.description, "Café y pan")
            self.assertEqual(created.account_id, self.cash_id)
            self.assertEqual(
                next(row for row in account_totals(session) if row["account_id"] == self.cash_id)["net"],
                -1500,
            )
            transaction_id = created.id

            with self.assertRaises(ValueError):
                update_transaction_category(session, transaction_id, self.transfer_id)
            session.rollback()

            with self.assertRaises(HTTPException) as error:
                update_manual_transaction(session, transaction_id, ManualTransactionInput(
                    transaction_type=TransactionType.INCOME, amount_clp=2000,
                    date=date(2026, 10, 13), description="Ingreso",
                    category_id=self.expense_id,
                ))
            self.assertEqual(error.exception.status_code, 422)
            session.rollback()
            updated = update_manual_transaction(session, transaction_id, ManualTransactionInput(
                transaction_type=TransactionType.INCOME, amount_clp=2000,
                date=date(2026, 10, 13), description="Ingreso",
                category_id=self.income_id,
            ))
            self.assertEqual(updated.amount_clp, 2000)
            self.assertIsNotNone(updated.updated_at)
            self.assertEqual(
                next(row for row in account_totals(session) if row["account_id"] == self.cash_id)["net"],
                2000,
            )
            delete_manual_transaction(session, transaction_id)
            self.assertIsNone(session.get(TransactionModel, transaction_id))
            self.assertFalse(any(row["account_id"] == self.cash_id for row in account_totals(session)))

    def test_pdf_and_other_users_are_protected(self) -> None:
        with TenantSession(self.engine, user_id=OWNER) as session:
            imported = TransactionModel(
                account_id=self.bank_id, statement_id=self.statement_id,
                date=date(2026, 10, 12), description="Banco",
                normalized_description="banco", amount_clp=-100,
                transaction_type=TransactionType.EXPENSE,
            )
            session.add(imported)
            session.commit()
            imported_id = imported.id
            payload = ManualTransactionInput(
                transaction_type=TransactionType.EXPENSE, amount_clp=100,
                date=date(2026, 10, 12), description="Cambio",
            )
            with self.assertRaises(HTTPException) as error:
                update_manual_transaction(session, imported_id, payload)
            self.assertEqual(error.exception.status_code, 409)
            with self.assertRaises(HTTPException) as error:
                delete_manual_transaction(session, imported_id)
            self.assertEqual(error.exception.status_code, 409)
            manual_id = create_manual_transaction(session, payload).id
        with TenantSession(self.engine, user_id=OTHER) as session:
            with self.assertRaises(HTTPException) as error:
                delete_manual_transaction(session, manual_id)
            self.assertEqual(error.exception.status_code, 404)
        with Session(self.engine) as session:
            self.assertEqual(len(session.exec(select(TransactionModel)).all()), 2)
