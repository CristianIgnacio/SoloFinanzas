import unittest
from datetime import date

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select
from tests.fixtures import Session

from app.domain.enums import (
    CategoryType,
    CurrencyCode,
    InstitutionCode,
    TransactionType,
)
from app.models.account import AccountModel
from app.models.category import CategoryModel
from app.models.categorization_rule import CategorizationRuleModel
from app.models.transaction import TransactionModel
from app.schemas.transaction import TransactionCandidate
from app.schemas.transaction import TransactionCandidateReview
from app.schemas.transaction import TransactionPreviewCandidate
from app.services.statements import (
    DuplicateStatementError,
    _categorize,
    apply_transaction_reviews,
    build_transaction_previews,
    import_pdf_transactions,
)
from app.services.transactions import update_transaction_category


class StatementImportTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)
        with Session(self.engine) as session:
            session.add(
                AccountModel(
                    name="Cuenta principal",
                    institution=InstitutionCode.BANCO_DE_CHILE,
                    account_type="Cuenta corriente",
                    currency=CurrencyCode.CLP,
                )
            )
            session.add(
                CategoryModel(
                    name="Otros",
                    type=CategoryType.EXPENSE,
                    is_default=True,
                )
            )
            session.add(
                CategoryModel(
                    name="Ingresos",
                    type=CategoryType.INCOME,
                    is_default=True,
                )
            )
            session.add(
                CategoryModel(
                    name="Transferencias",
                    type=CategoryType.TRANSFER,
                    is_default=True,
                )
            )
            session.commit()

    def test_imports_transactions_and_rejects_same_statement(self) -> None:
        candidate = TransactionCandidate(
            source_line="07/01 PAGO:PRUEBA 1.000 D",
            date=date(2026, 1, 7),
            description="PAGO:PRUEBA",
            normalized_description="pago prueba",
            amount_clp=-1000,
            transaction_type=TransactionType.EXPENSE,
        )

        with Session(self.engine) as session:
            result = import_pdf_transactions(
                session,
                account_id=1,
                file_name="cartola.pdf",
                file_checksum="checksum-1",
                raw_path="data/raw/cartola.pdf",
                period_month="2026-01",
                candidates=[candidate],
            )
            self.assertEqual(result.result.inserted_count, 1)

        with Session(self.engine) as session:
            with self.assertRaises(DuplicateStatementError):
                import_pdf_transactions(
                    session,
                    account_id=1,
                    file_name="cartola.pdf",
                    file_checksum="checksum-1",
                    raw_path="data/raw/cartola.pdf",
                    period_month="2026-01",
                    candidates=[candidate],
                )

    def test_transfer_rule_preserves_money_direction(self) -> None:
        with Session(self.engine) as session:
            transfer_category = session.exec(
                select(CategoryModel).where(CategoryModel.type == CategoryType.TRANSFER)
            ).one()
            session.add(
                CategorizationRuleModel(
                    keyword="traspaso",
                    category_id=transfer_category.id,
                    priority=10,
                )
            )
            session.commit()

            income_category_id, _, _ = _categorize(
                session,
                "traspaso de cuenta propia",
                TransactionType.INCOME.value,
            )
            expense_category_id, _, _ = _categorize(
                session,
                "traspaso a cuenta propia",
                TransactionType.EXPENSE.value,
            )

        self.assertEqual(income_category_id, transfer_category.id)
        self.assertEqual(expense_category_id, transfer_category.id)

    def test_incompatible_rule_leaves_transaction_uncategorized(self) -> None:
        with Session(self.engine) as session:
            expense_category = session.exec(
                select(CategoryModel).where(CategoryModel.type == CategoryType.EXPENSE)
            ).first()
            session.add(
                CategorizationRuleModel(
                    keyword="sueldo",
                    category_id=expense_category.id,
                    priority=10,
                )
            )
            session.commit()

            category_id, _, rule_id = _categorize(
                session,
                "abono sueldo",
                TransactionType.INCOME.value,
            )

        self.assertIsNone(category_id)
        self.assertIsNone(rule_id)

    def test_blank_rule_is_ignored(self) -> None:
        with Session(self.engine) as session:
            expense_category = session.exec(
                select(CategoryModel).where(CategoryModel.type == CategoryType.EXPENSE)
            ).first()
            session.add(
                CategorizationRuleModel(
                    keyword="",
                    category_id=expense_category.id,
                    priority=1,
                )
            )
            session.commit()

            category_id, category_source, rule_id = _categorize(
                session,
                "compra sin regla conocida",
                TransactionType.EXPENSE.value,
            )

        self.assertIsNone(category_id)
        self.assertIsNone(category_source)
        self.assertIsNone(rule_id)

    def test_higher_priority_specific_rule_wins(self) -> None:
        with Session(self.engine) as session:
            transport = CategoryModel(
                name="Transporte",
                type=CategoryType.EXPENSE,
                is_default=False,
            )
            food = CategoryModel(
                name="Comida",
                type=CategoryType.EXPENSE,
                is_default=False,
            )
            session.add_all([transport, food])
            session.commit()
            session.refresh(transport)
            session.refresh(food)
            session.add_all(
                [
                    CategorizationRuleModel(
                        keyword="uber",
                        category_id=transport.id,
                        priority=10,
                    ),
                    CategorizationRuleModel(
                        keyword="uber eats",
                        category_id=food.id,
                        priority=20,
                    ),
                ]
            )
            session.commit()

            category_id, _, _ = _categorize(
                session,
                "pago uber eats",
                TransactionType.EXPENSE.value,
            )

        self.assertEqual(category_id, food.id)

    def test_rule_matches_complete_words_not_arbitrary_substrings(self) -> None:
        with Session(self.engine) as session:
            transfer = session.exec(
                select(CategoryModel).where(CategoryModel.type == CategoryType.TRANSFER)
            ).one()
            transport = CategoryModel(
                name="Transporte",
                type=CategoryType.EXPENSE,
                is_default=False,
            )
            session.add(transport)
            session.commit()
            session.refresh(transport)
            session.add_all(
                [
                    CategorizationRuleModel(
                        keyword="tr",
                        category_id=transfer.id,
                        priority=100,
                    ),
                    CategorizationRuleModel(
                        keyword="uber trip",
                        category_id=transport.id,
                        priority=20,
                    ),
                ]
            )
            session.commit()

            category_id, _, _ = _categorize(
                session,
                "compra uber trip",
                TransactionType.EXPENSE.value,
            )

        self.assertEqual(category_id, transport.id)

    def test_manual_transfer_category_is_valid_for_expense(self) -> None:
        candidate = TransactionCandidate(
            source_line="07/01 TRASPASO A:PRUEBA 1.000 D",
            date=date(2026, 1, 7),
            description="TRASPASO A:PRUEBA",
            normalized_description="traspaso a prueba",
            amount_clp=-1000,
            transaction_type=TransactionType.EXPENSE,
        )

        with Session(self.engine) as session:
            transfer_category = session.exec(
                select(CategoryModel).where(CategoryModel.type == CategoryType.TRANSFER)
            ).one()
            session.add(
                CategorizationRuleModel(
                    keyword="traspaso a",
                    category_id=transfer_category.id,
                    priority=20,
                )
            )
            session.commit()
            imported = import_pdf_transactions(
                session,
                account_id=1,
                file_name="transferencia.pdf",
                file_checksum="checksum-transfer",
                raw_path="data/raw/transferencia.pdf",
                period_month="2026-01",
                candidates=[candidate],
            )
            transfer_category_id = transfer_category.id
            transaction = session.exec(
                select(TransactionModel).where(
                    TransactionModel.statement_id == imported.statement.id
                )
            ).one()
            self.assertIsNotNone(transaction.rule_id_applied)

            updated = update_transaction_category(
                session,
                transaction.id,
                transfer_category_id,
                "manual",
            )

        self.assertEqual(updated.category_id, transfer_category_id)
        self.assertEqual(updated.transaction_type, TransactionType.EXPENSE)
        self.assertEqual(updated.category_source, "manual")
        self.assertIsNone(updated.rule_id_applied)

    def test_preview_candidates_include_suggested_category(self) -> None:
        candidate = TransactionCandidate(
            source_line="07/01 COMPRA UBER 1.000",
            date=date(2026, 1, 7),
            description="COMPRA UBER",
            normalized_description="compra uber",
            amount_clp=-1000,
            transaction_type=TransactionType.EXPENSE,
        )

        with Session(self.engine) as session:
            transport_category = CategoryModel(
                name="Transporte",
                type=CategoryType.EXPENSE,
                is_default=False,
            )
            session.add(transport_category)
            session.commit()
            session.refresh(transport_category)
            session.add(
                CategorizationRuleModel(
                    keyword="uber",
                    category_id=transport_category.id,
                    priority=10,
                )
            )
            session.commit()

            previews = build_transaction_previews(session, [candidate])

        self.assertEqual(previews[0].suggested_category_id, transport_category.id)
        self.assertEqual(previews[0].category_source, "rule")

    def test_preview_candidates_can_be_enriched_more_than_once(self) -> None:
        candidate = TransactionPreviewCandidate(
            source_line="07/01 COMPRA UBER 1.000",
            date=date(2026, 1, 7),
            description="COMPRA UBER",
            normalized_description="compra uber",
            amount_clp=-1000,
            transaction_type=TransactionType.EXPENSE,
            suggested_category_id=None,
            category_source=None,
            rule_id_applied=None,
        )

        with Session(self.engine) as session:
            previews = build_transaction_previews(session, [candidate])

        self.assertEqual(len(previews), 1)
        self.assertIsNone(previews[0].suggested_category_id)
        self.assertIsNone(previews[0].category_source)

    def test_import_reviewed_candidate_uses_manual_category_and_type(self) -> None:
        candidate = TransactionCandidate(
            source_line="07/01 ABONO MAL CLASIFICADO 1.000",
            date=date(2026, 1, 7),
            description="ABONO MAL CLASIFICADO",
            normalized_description="abono mal clasificado",
            amount_clp=1000,
            transaction_type=TransactionType.INCOME,
        )

        with Session(self.engine) as session:
            expense_category = session.exec(
                select(CategoryModel).where(CategoryModel.type == CategoryType.EXPENSE)
            ).first()
            expense_category_id = expense_category.id
            reviewed_candidates, category_overrides = apply_transaction_reviews(
                session,
                [candidate],
                [
                    TransactionCandidateReview(
                        source_line=candidate.source_line,
                        transaction_type=TransactionType.EXPENSE,
                        category_id=expense_category_id,
                    )
                ],
            )

            imported = import_pdf_transactions(
                session,
                account_id=1,
                file_name="reviewed.pdf",
                file_checksum="checksum-reviewed",
                raw_path="data/raw/reviewed.pdf",
                period_month="2026-01",
                candidates=reviewed_candidates,
                category_overrides=category_overrides,
            )
            transaction = session.exec(
                select(TransactionModel).where(
                    TransactionModel.statement_id == imported.statement.id
                )
            ).one()

        self.assertEqual(transaction.amount_clp, -1000)
        self.assertEqual(transaction.transaction_type, TransactionType.EXPENSE)
        self.assertEqual(transaction.category_id, expense_category_id)
        self.assertEqual(transaction.category_source, "manual")

    def test_review_preserves_identical_rows_as_distinct_movements(self) -> None:
        source_line = "15/06 7777777 401 TRANSF A COMERCIO DEMO 20.000"
        candidates = [
            TransactionCandidate(
                source_id=f"row-{index:06d}",
                source_line=source_line,
                date=date(2026, 6, 15),
                description="Transf a COMERCIO DEMO",
                normalized_description="transf a cleo chile",
                amount_clp=-20000,
                transaction_type=TransactionType.EXPENSE,
            )
            for index in (1, 2)
        ]

        with Session(self.engine) as session:
            reviews = [
                TransactionCandidateReview(
                    source_id=candidate.source_id,
                    source_line=candidate.source_line,
                    transaction_type=TransactionType.EXPENSE,
                    category_id=None,
                )
                for candidate in candidates
            ]
            reviewed_candidates, category_overrides = apply_transaction_reviews(
                session, candidates, reviews
            )
            imported = import_pdf_transactions(
                session,
                account_id=1,
                file_name="identical-rows.pdf",
                file_checksum="checksum-identical-rows",
                raw_path="data/raw/identical-rows.pdf",
                period_month="2026-06",
                candidates=reviewed_candidates,
                category_overrides=category_overrides,
            )

        self.assertEqual(imported.result.inserted_count, 2)
        self.assertEqual(imported.result.omitted_internal_count, 0)


if __name__ == "__main__":
    unittest.main()
