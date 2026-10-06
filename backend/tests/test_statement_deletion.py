import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import event
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select
from tests.fixtures import Session

from app.domain.enums import CategoryType, CurrencyCode, InstitutionCode, TransactionType
from app.models.account import AccountModel
from app.models.category import CategoryModel
from app.models.internal_transfer_match import InternalTransferMatchModel
from app.models.statement import StatementModel
from app.models.transaction import TransactionModel
from app.schemas.transaction import TransactionCandidate
from app.services import statements as statement_service
from app.services.internal_transfers import refresh_internal_transfer_matches
from app.services.statements import (
    delete_statement,
    get_statement_deletion_impact,
    import_pdf_transactions,
)
from app.services.transactions import list_transactions


class StatementDeletionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )

        @event.listens_for(self.engine, "connect")
        def enable_foreign_keys(dbapi_connection, _) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        SQLModel.metadata.create_all(self.engine)
        with Session(self.engine) as session:
            first_account = AccountModel(
                name="Cuenta origen",
                institution=InstitutionCode.BANCO_DE_CHILE,
                account_type="Cuenta corriente",
                currency=CurrencyCode.CLP,
            )
            second_account = AccountModel(
                name="Cuenta destino",
                institution=InstitutionCode.BANCO_SANTANDER,
                account_type="Cuenta corriente",
                currency=CurrencyCode.CLP,
            )
            transfer_category = CategoryModel(
                name="Transferencias",
                type=CategoryType.TRANSFER,
                is_default=True,
            )
            session.add_all([first_account, second_account, transfer_category])
            session.flush()

            first_statement = StatementModel(
                account_id=first_account.id,
                file_name="origen.pdf",
                file_type="pdf",
                file_checksum="same-checksum",
                period_month="2026-01",
                raw_path="data/raw/origen-inexistente.pdf",
            )
            second_statement = StatementModel(
                account_id=second_account.id,
                file_name="destino.pdf",
                file_type="pdf",
                file_checksum="destination-checksum",
                period_month="2026-01",
                raw_path="data/raw/destino-inexistente.pdf",
            )
            session.add_all([first_statement, second_statement])
            session.flush()

            outgoing = TransactionModel(
                account_id=first_account.id,
                statement_id=first_statement.id,
                date=date(2026, 1, 10),
                description="Transferencia enviada",
                normalized_description="transferencia enviada",
                amount_clp=-5000,
                transaction_type=TransactionType.EXPENSE,
                category_id=transfer_category.id,
                fingerprint="outgoing-fingerprint",
            )
            incoming = TransactionModel(
                account_id=second_account.id,
                statement_id=second_statement.id,
                date=date(2026, 1, 10),
                description="Transferencia recibida",
                normalized_description="transferencia recibida",
                amount_clp=5000,
                transaction_type=TransactionType.INCOME,
                category_id=transfer_category.id,
                fingerprint="incoming-fingerprint",
            )
            session.add_all([outgoing, incoming])
            refresh_internal_transfer_matches(session)
            session.commit()

            self.first_account_id = first_account.id
            self.first_statement_id = first_statement.id
            self.second_statement_id = second_statement.id

    def test_deletes_statement_transactions_and_rebuilds_transfer_matches(self) -> None:
        with Session(self.engine) as session:
            impact = get_statement_deletion_impact(session, self.first_statement_id)

            self.assertIsNotNone(impact)
            self.assertEqual(impact.transaction_count, 1)
            self.assertEqual(impact.income_total_clp, 0)
            self.assertEqual(impact.expense_total_clp, 5000)
            self.assertEqual(impact.net_total_clp, -5000)
            self.assertEqual(impact.affected_periods, ["2026-01"])
            self.assertEqual(impact.internal_transfer_match_count, 1)

            result = delete_statement(session, self.first_statement_id)

            self.assertIsNotNone(result)
            self.assertEqual(result.transaction_count, 1)
            self.assertFalse(result.raw_file_deleted)
            self.assertIsNone(session.get(StatementModel, self.first_statement_id))
            self.assertEqual(
                session.exec(
                    select(TransactionModel).where(
                        TransactionModel.statement_id == self.first_statement_id
                    )
                ).all(),
                [],
            )
            self.assertEqual(session.exec(select(InternalTransferMatchModel)).all(), [])
            surviving = list_transactions(
                session,
                statement_id=self.second_statement_id,
            )
            self.assertEqual(len(surviving), 1)
            self.assertFalse(surviving[0].is_internal_transfer)

    def test_allows_reimport_after_statement_is_deleted(self) -> None:
        candidate = TransactionCandidate(
            source_line="10/01 TRANSFERENCIA ENVIADA 5.000",
            date=date(2026, 1, 10),
            description="Transferencia enviada",
            normalized_description="transferencia enviada",
            amount_clp=-5000,
            transaction_type=TransactionType.EXPENSE,
        )

        with Session(self.engine) as session:
            delete_statement(session, self.first_statement_id)
            imported = import_pdf_transactions(
                session,
                account_id=self.first_account_id,
                file_name="origen.pdf",
                file_checksum="same-checksum",
                raw_path="data/raw/origen-inexistente.pdf",
                period_month="2026-01",
                candidates=[candidate],
            )

        self.assertEqual(imported.result.inserted_count, 1)

    def test_keeps_shared_pdf_until_last_statement_is_deleted(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            backend_dir = Path(temporary_directory)
            raw_dir = backend_dir / "data" / "raw"
            raw_dir.mkdir(parents=True)
            raw_file = raw_dir / "shared.pdf"
            raw_file.write_bytes(b"pdf")

            with patch.object(statement_service, "BACKEND_DIR", backend_dir), patch.object(
                statement_service,
                "RAW_DIR",
                raw_dir,
            ):
                with Session(self.engine) as session:
                    first = session.get(StatementModel, self.first_statement_id)
                    second = session.get(StatementModel, self.second_statement_id)
                    first.raw_path = "data/raw/shared.pdf"
                    second.raw_path = "data/raw/shared.pdf"
                    session.add_all([first, second])
                    session.commit()

                    first_result = delete_statement(session, self.first_statement_id)
                    self.assertFalse(first_result.raw_file_delete_eligible)
                    self.assertFalse(first_result.raw_file_deleted)
                    self.assertTrue(raw_file.exists())

                    second_result = delete_statement(session, self.second_statement_id)
                    self.assertTrue(second_result.raw_file_delete_eligible)
                    self.assertTrue(second_result.raw_file_deleted)
                    self.assertFalse(raw_file.exists())

    def test_never_deletes_a_file_outside_managed_raw_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            backend_dir = Path(temporary_directory)
            raw_dir = backend_dir / "data" / "raw"
            raw_dir.mkdir(parents=True)
            outside_file = backend_dir / "outside.pdf"
            outside_file.write_bytes(b"pdf")

            with patch.object(statement_service, "BACKEND_DIR", backend_dir), patch.object(
                statement_service,
                "RAW_DIR",
                raw_dir,
            ):
                with Session(self.engine) as session:
                    statement = session.get(StatementModel, self.first_statement_id)
                    statement.raw_path = "outside.pdf"
                    session.add(statement)
                    session.commit()

                    result = delete_statement(session, self.first_statement_id)

            self.assertFalse(result.raw_file_delete_eligible)
            self.assertFalse(result.raw_file_deleted)
            self.assertTrue(outside_file.exists())

    def test_returns_none_when_statement_does_not_exist(self) -> None:
        with Session(self.engine) as session:
            self.assertIsNone(get_statement_deletion_impact(session, 9999))
            self.assertIsNone(delete_statement(session, 9999))


if __name__ == "__main__":
    unittest.main()
