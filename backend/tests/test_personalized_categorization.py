import unittest
from datetime import date
from uuid import UUID

from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine, select

from app.core.seeding import catalog_changes, seed_default_categories, seed_default_categorization_rules
from app.domain.enums import CategorySource, CategoryType, TransactionType
from app.core.tenancy import TenantSession
from app.models.user import UserModel
from app.models import AccountModel, CategoryFeedbackModel, CategoryModel, CategorizationRuleModel, StatementModel, TransactionModel
from app.services.category_feedback import (
    forget_pattern, memory_suggestion, rule_proposals, undo_decision,
)
from app.services.statements import (
    _categorize, apply_transaction_reviews, import_pdf_transactions,
)
from app.schemas.transaction import TransactionCandidate, TransactionCandidateReview
from app.services.transactions import update_transaction_category
from app.services.statements import delete_statement
from app.services.categories import merge_category, update_category
from app.schemas.category import CategoryUpdate
from app.services.categorization_rules import delete_categorization_rule
from app.api.routes.categorization_rules import ProposedRule, accept_rule_proposal
from tests.fixtures import Session


class PersonalizedCategorizationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        with self.engine.connect() as connection:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        SQLModel.metadata.create_all(self.engine)
        with Session(self.engine) as session:
            seed_default_categories(session)
            session.flush()
            seed_default_categorization_rules(session)
            account = AccountModel(name="Cuenta", account_type="corriente")
            session.add(account)
            session.flush()
            statement = StatementModel(account_id=account.id, file_name="datos.pdf", file_type="pdf")
            session.add(statement)
            session.commit()
            self.account_id, self.statement_id = account.id, statement.id
            self.food_id = session.exec(select(CategoryModel.id).where(CategoryModel.code == "food")).one()
            self.groceries_id = session.exec(select(CategoryModel.id).where(CategoryModel.code == "groceries")).one()

    def tearDown(self):
        self.engine.dispose()

    def _transaction(self, session, description="Compra barrio", category_id=None):
        tx = TransactionModel(
            account_id=self.account_id, statement_id=self.statement_id,
            date=date(2026, 1, 1), description=description,
            normalized_description=description.lower(), amount_clp=-1000,
            transaction_type=TransactionType.EXPENSE, category_id=category_id,
        )
        session.add(tx)
        session.commit()
        return tx

    def test_retiring_default_rule_preserves_history_and_rule_reference(self):
        with Session(self.engine) as session:
            rule = CategorizationRuleModel(keyword="tienda de comestibles", category_id=self.groceries_id,
                                           priority=30, origin="system", transaction_type="expense")
            session.add(rule)
            session.commit()
            tx = self._transaction(session, "Tienda de comestibles", self.groceries_id)
            tx.rule_id_applied = rule.id
            tx.category_source = CategorySource.RULE
            session.add(tx)
            session.commit()
            session.refresh(tx)
            before = tx.model_dump()
            seed_default_categorization_rules(session, since_version=1)
            session.commit()
            session.refresh(tx)
            self.assertEqual(tx.model_dump(), before)
            self.assertFalse(session.get(CategorizationRuleModel, rule.id).is_active)

    def test_catalog_preview_is_additive_and_idempotent(self):
        with Session(self.engine) as session:
            food = session.get(CategoryModel, self.food_id)
            food.name = "Mi comida"
            session.add(food)
            session.commit()
            preview = catalog_changes(session)
            self.assertFalse(any(item["status"] == "created" for item in preview))
            catalog_changes(session, apply=True)
            session.commit()
            self.assertEqual(session.get(CategoryModel, self.food_id).name, "Mi comida")
            self.assertEqual(session.get(CategoryModel, self.groceries_id).parent_id, self.food_id)

    def test_legacy_parent_is_adopted_without_renaming(self):
        with Session(self.engine) as session:
            parent = session.get(CategoryModel, self.food_id)
            parent.code = None
            parent.name = "Comida"
            session.add(parent)
            session.commit()
            result = catalog_changes(session, apply=True)
            session.commit()
            self.assertEqual(session.get(CategoryModel, self.food_id).name, "Comida")
            self.assertEqual(session.get(CategoryModel, self.food_id).code, "food")
            self.assertTrue(any(item["code"] == "food" and item["status"] == "adopted" for item in result))

    def test_existing_small_catalog_expands_without_touching_historical_transactions(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        SQLModel.metadata.create_all(engine)
        try:
            with Session(engine) as session:
                old = CategoryModel(name="Comida", type=CategoryType.EXPENSE, is_default=True)
                account = AccountModel(name="Cuenta antigua", account_type="corriente")
                session.add_all([old, account])
                session.flush()
                statement = StatementModel(account_id=account.id, file_name="old.pdf", file_type="pdf")
                session.add(statement)
                session.flush()
                tx = TransactionModel(account_id=account.id, statement_id=statement.id,
                    date=date(2025, 1, 1), description="Histórico",
                    normalized_description="historico", amount_clp=-100,
                    transaction_type=TransactionType.EXPENSE, category_id=old.id)
                session.add(tx)
                session.commit()
                original_id = old.id
                preview = catalog_changes(session)
                self.assertTrue(any(item["code"] == "food" and item["status"] == "adopted" for item in preview))
                self.assertTrue(any(item["code"] == "cash_withdrawal" and item["status"] == "created" for item in preview))
                catalog_changes(session, apply=True)
                session.commit()
                self.assertEqual(session.get(TransactionModel, tx.id).category_id, original_id)
                self.assertEqual(session.get(CategoryModel, original_id).name, "Comida")
                self.assertEqual(len([row for row in catalog_changes(session) if row["status"] == "created"]), 0)
                cash = session.exec(select(CategoryModel).where(CategoryModel.code == "cash_withdrawal")).one()
                self.assertEqual(cash.name, "Retiro de efectivo")
        finally:
            engine.dispose()

    def test_ambiguous_catalog_mapping_is_reported_and_skipped(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        SQLModel.metadata.create_all(engine)
        try:
            with Session(engine) as session:
                session.add_all([
                    CategoryModel(name="Comida", type=CategoryType.EXPENSE),
                    CategoryModel(name="Alimentación", type=CategoryType.EXPENSE),
                ])
                session.commit()
                changes = catalog_changes(session, apply=True)
                session.commit()
                self.assertEqual(next(item for item in changes if item["code"] == "food")["status"], "skipped")
                self.assertEqual(next(item for item in changes if item["code"] == "groceries")["status"], "skipped")
        finally:
            engine.dispose()

    def test_names_equivalent_by_accents_and_spaces_are_not_merged_if_ambiguous(self):
        with Session(self.engine) as session:
            cafes = session.exec(select(CategoryModel).where(CategoryModel.code == "cafes")).one()
            cafes.code = None
            cafes.name = "Cafeterias"
            duplicate = CategoryModel(name="  CAFETERÍAS  ", type=CategoryType.EXPENSE,
                                      parent_id=self.food_id)
            session.add_all([cafes, duplicate])
            session.commit()
            before = {row.id for row in session.exec(select(CategoryModel)).all()}
            changes = catalog_changes(session, apply=True)
            session.commit()
            self.assertEqual(next(item for item in changes if item["code"] == "cafes")["status"], "skipped")
            self.assertEqual({row.id for row in session.exec(select(CategoryModel)).all()}, before)
            self.assertIsNone(session.get(CategoryModel, cafes.id).code)
            self.assertIsNone(session.get(CategoryModel, duplicate.id).code)

    def test_confirmation_and_undo_do_not_inflate_memory(self):
        with Session(self.engine) as session:
            tx = self._transaction(session, category_id=self.groceries_id)
            saved = update_transaction_category(session, tx.id, self.groceries_id,
                                                action="confirm", remember=True, expected_version=0)
            self.assertEqual(saved.category_version, 1)
            self.assertTrue(saved.category_reviewed)
            self.assertEqual(memory_suggestion(session, tx.normalized_description, TransactionType.EXPENSE)["count"], 1)
            again = update_transaction_category(session, tx.id, self.groceries_id,
                                                action="confirm", remember=True, expected_version=1)
            self.assertEqual(memory_suggestion(session, tx.normalized_description, TransactionType.EXPENSE)["count"], 1)
            undo_decision(session, tx.id, again.category_event_id, again.category_version)
            self.assertEqual(memory_suggestion(session, tx.normalized_description, TransactionType.EXPENSE)["count"], 1)
            with self.assertRaises(ValueError):
                undo_decision(session, tx.id, again.category_event_id, again.category_version)

    def test_contains_memory_requires_a_pattern_in_the_source_description(self):
        with Session(self.engine) as session:
            tx = self._transaction(session, "Compra barrio norte")
            with self.assertRaises(ValueError):
                update_transaction_category(session, tx.id, self.groceries_id,
                    remember=True, pattern="otra tienda", match_type="contains")
            session.rollback()
            update_transaction_category(session, tx.id, self.groceries_id,
                remember=True, pattern="barrio", match_type="contains")
            suggestion = memory_suggestion(session, "Compra barrio sur", TransactionType.EXPENSE)
            self.assertEqual(suggestion["category_id"], self.groceries_id)

    def test_forgetting_memory_cannot_be_reversed_by_undoing_a_correction(self):
        with Session(self.engine) as session:
            tx = self._transaction(session)
            update_transaction_category(session, tx.id, self.groceries_id, remember=True)
            corrected = update_transaction_category(session, tx.id, self.food_id, remember=True)
            self.assertEqual(forget_pattern(session, tx.description, tx.transaction_type), 1)
            undo_decision(session, tx.id, corrected.category_event_id, corrected.category_version)
            self.assertEqual(session.get(TransactionModel, tx.id).category_id, self.groceries_id)
            self.assertIsNone(memory_suggestion(session, tx.description, tx.transaction_type))

    def test_undo_preserves_previous_category_after_original_rule_is_deleted(self):
        with Session(self.engine) as session:
            rule = CategorizationRuleModel(keyword="barrio", category_id=self.food_id)
            session.add(rule)
            session.commit()
            tx = self._transaction(session, category_id=self.food_id)
            tx.category_source = CategorySource.RULE
            tx.rule_id_applied = rule.id
            session.add(tx)
            session.commit()
            corrected = update_transaction_category(session, tx.id, self.groceries_id, remember=True)
            delete_categorization_rule(session, rule.id)
            undo_decision(session, tx.id, corrected.category_event_id, corrected.category_version)
            restored = session.get(TransactionModel, tx.id)
            self.assertEqual(restored.category_id, self.food_id)
            self.assertEqual(restored.category_source, CategorySource.RULE)
            self.assertIsNone(restored.rule_id_applied)
            self.assertFalse(restored.category_reviewed)

    def test_catalog_does_not_adopt_a_category_with_another_stable_code(self):
        with Session(self.engine) as session:
            category = session.get(CategoryModel, self.groceries_id)
            category.code = "custom_groceries"
            session.add(category)
            session.commit()
            result = catalog_changes(session, apply=True)
            session.commit()
            self.assertEqual(next(item for item in result if item["code"] == "groceries")["status"], "skipped")
            self.assertEqual(session.get(CategoryModel, self.groceries_id).code, "custom_groceries")

    def test_stale_session_cannot_overwrite_a_newer_category_or_its_memory(self):
        with Session(self.engine) as session:
            transaction_id = self._transaction(session).id
        with Session(self.engine) as first, Session(self.engine) as second:
            stale = second.get(TransactionModel, transaction_id)
            update_transaction_category(first, transaction_id, self.groceries_id,
                                        remember=True, expected_version=0)
            self.assertEqual(stale.category_version, 0)
            with self.assertRaises(ValueError):
                update_transaction_category(second, transaction_id, self.food_id,
                                            remember=True, expected_version=0)
        with Session(self.engine) as session:
            tx = session.get(TransactionModel, transaction_id)
            self.assertEqual(tx.category_id, self.groceries_id)
            self.assertEqual(tx.category_version, 1)
            self.assertEqual(len(session.exec(select(CategoryFeedbackModel)).all()), 1)
            self.assertEqual(memory_suggestion(session, tx.description, tx.transaction_type)["count"], 1)

    def test_three_distinct_corrections_propose_rule_and_conflicts_block_legacy(self):
        with Session(self.engine) as session:
            session.add(CategorizationRuleModel(keyword="comercio", category_id=self.food_id,
                                                priority=10, origin="legacy"))
            session.commit()
            for _ in range(3):
                tx = self._transaction(session, "Comercio ZZ", None)
                update_transaction_category(session, tx.id, self.groceries_id, remember=True)
            suggestion = memory_suggestion(session, "Comercio ZZ", TransactionType.EXPENSE)
            self.assertEqual(suggestion["category_id"], self.groceries_id)
            self.assertEqual(suggestion["count"], 3)
            self.assertEqual(rule_proposals(session)[0]["evidence_count"], 3)
            self.assertEqual(_categorize(session, "Comercio ZZ", "expense")[0], self.food_id)
            other = self._transaction(session, "Comercio ZZ", None)
            update_transaction_category(session, other.id, self.food_id, remember=True)
            self.assertTrue(memory_suggestion(session, "Comercio ZZ", TransactionType.EXPENSE)["conflict"])
            self.assertIsNone(_categorize(session, "Comercio ZZ", "expense")[0])
            self.assertEqual(rule_proposals(session), [])
            self.assertEqual(forget_pattern(session, "Comercio ZZ", TransactionType.EXPENSE), 4)
            self.assertIsNone(memory_suggestion(session, "Comercio ZZ", TransactionType.EXPENSE))

    def test_accepted_rule_applies_only_to_future_matching_direction(self):
        with Session(self.engine) as session:
            for _ in range(3):
                tx = self._transaction(session, "Cajero especial")
                update_transaction_category(session, tx.id, self.groceries_id, remember=True)
            proposal = rule_proposals(session)[0]
            rule = accept_rule_proposal(ProposedRule(
                pattern=proposal["pattern"], match_type=proposal["match_type"],
                transaction_type=TransactionType.EXPENSE, category_id=self.groceries_id,
            ), session)
            self.assertEqual(rule.origin, "accepted")
            self.assertEqual(rule_proposals(session), [])
            self.assertEqual(_categorize(session, "Cajero especial", "expense")[0], self.groceries_id)
            self.assertIsNone(_categorize(session, "Cajero especial", "income")[0])
            self.assertEqual(session.exec(select(TransactionModel).where(
                TransactionModel.description == "Cajero especial"
            )).all()[0].category_source, CategorySource.MANUAL)

    def test_deleting_statement_removes_feedback_and_merge_retargets_it(self):
        with Session(self.engine) as session:
            source = CategoryModel(name="Mi gasto", type=CategoryType.EXPENSE, is_default=False)
            session.add(source)
            session.commit()
            tx = self._transaction(session, "Prueba merge")
            update_transaction_category(session, tx.id, source.id, remember=True)
            source_id = source.id
            rule = CategorizationRuleModel(keyword="prueba merge", category_id=source_id, priority=12,
                                           origin="user", is_active=False)
            session.add(rule)
            session.commit()
            session.refresh(tx)
            session.refresh(rule)
            original = tx.model_dump(exclude={"category_id", "category_version"})
            original_rule = rule.model_dump(exclude={"category_id"})
            merge_category(session, source_id, self.groceries_id)
            session.refresh(tx)
            session.refresh(rule)
            self.assertIsNone(session.get(CategoryModel, source_id))
            self.assertEqual(tx.model_dump(exclude={"category_id", "category_version"}), original)
            self.assertEqual(tx.category_id, self.groceries_id)
            self.assertEqual(rule.model_dump(exclude={"category_id"}), original_rule)
            self.assertEqual(rule.category_id, self.groceries_id)
            self.assertEqual(memory_suggestion(session, "Prueba merge", TransactionType.EXPENSE)["category_id"],
                             self.groceries_id)
            delete_statement(session, self.statement_id)
            self.assertEqual(session.exec(select(CategoryFeedbackModel)).all(), [])

    def test_feedback_is_private_between_users(self):
        other = UUID("22222222-2222-4222-8222-222222222222")
        with Session(self.engine) as session:
            tx = self._transaction(session, "Privado")
            update_transaction_category(session, tx.id, self.groceries_id, remember=True)
            session.add(UserModel(id=other, initialized=True))
            session.commit()
        with TenantSession(self.engine, user_id=other) as session:
            self.assertEqual(session.exec(select(CategoryFeedbackModel)).all(), [])
            self.assertIsNone(memory_suggestion(session, "Privado", TransactionType.EXPENSE))

    def test_archiving_category_suspends_memory_and_proposals_without_changing_history(self):
        with Session(self.engine) as session:
            ids = []
            for _ in range(3):
                tx = self._transaction(session, "Comercio archivado")
                ids.append(tx.id)
                update_transaction_category(session, tx.id, self.groceries_id, remember=True)
            self.assertEqual(len(rule_proposals(session)), 1)
            update_category(session, self.food_id, CategoryUpdate(is_active=False))
            self.assertIsNone(memory_suggestion(session, "Comercio archivado", TransactionType.EXPENSE))
            self.assertEqual(rule_proposals(session), [])
            self.assertTrue(all(session.get(TransactionModel, ident).category_id == self.groceries_id for ident in ids))
            self.assertEqual(next(item for item in catalog_changes(session) if item["code"] == "food")["status"], "skipped")

    def test_unchanged_review_does_not_create_verified_evidence(self):
        candidate = TransactionCandidate(
            source_id="row-1", source_line="1", date=date(2026, 1, 1),
            description="Giro en cajero", normalized_description="giro en cajero",
            amount_clp=-1000, transaction_type=TransactionType.EXPENSE,
        )
        with Session(self.engine) as session:
            category_id, _, _ = _categorize(session, candidate.description, "expense")
            reviewed, overrides = apply_transaction_reviews(session, [candidate], [
                TransactionCandidateReview(source_id="row-1", source_line="1",
                    transaction_type=TransactionType.EXPENSE, category_id=category_id, action="unchanged")
            ])
            response = import_pdf_transactions(session, account_id=self.account_id,
                file_name="new.pdf", file_checksum="hash-1", raw_path=None,
                period_month="2026-01", candidates=reviewed, category_overrides=overrides,
                review_decisions={"row-1": TransactionCandidateReview(source_id="row-1", source_line="1",
                    transaction_type=TransactionType.EXPENSE, category_id=category_id, action="unchanged")})
            tx = session.exec(select(TransactionModel).where(
                TransactionModel.statement_id == response.statement.id)).one()
            self.assertEqual(tx.category_source, CategorySource.RULE)
            self.assertFalse(tx.category_reviewed)
            self.assertEqual(session.exec(select(CategoryFeedbackModel)).all(), [])

    def test_explicit_import_confirmation_creates_one_memory_example(self):
        candidate = TransactionCandidate(source_id="row-2", source_line="2",
            date=date(2026, 1, 2), description="Giro en cajero",
            normalized_description="giro en cajero", amount_clp=-1000,
            transaction_type=TransactionType.EXPENSE)
        with Session(self.engine) as session:
            category_id, _, _ = _categorize(session, candidate.description, "expense")
            review = TransactionCandidateReview(source_id="row-2", source_line="2",
                transaction_type=TransactionType.EXPENSE, category_id=category_id,
                action="confirm", remember=True)
            reviewed, overrides = apply_transaction_reviews(session, [candidate], [review])
            result = import_pdf_transactions(session, account_id=self.account_id,
                file_name="new.pdf", file_checksum="hash-2", raw_path=None,
                period_month="2026-01", candidates=reviewed, category_overrides=overrides,
                review_decisions={"row-2": review})
            tx = session.exec(select(TransactionModel).where(
                TransactionModel.statement_id == result.statement.id)).one()
            self.assertTrue(tx.category_reviewed)
            self.assertEqual(memory_suggestion(session, "Giro en cajero", TransactionType.EXPENSE)["count"], 1)


if __name__ == "__main__":
    unittest.main()
