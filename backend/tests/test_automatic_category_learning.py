"""Behavioral contracts for automatic learning, using synthetic transactions."""
from datetime import datetime, timedelta, timezone
import unittest
from uuid import UUID

from sqlmodel import select

from app.core.tenancy import TenantSession
from app.models import CategoryFeedbackModel, CategoryPatternModel, CategorizationRuleModel, TransactionModel
from app.models.user import UserModel
from app.services.category_feedback import CategoryConflictError, record_decision, forget_pattern, memory_suggestion, undo_decision
from app.services.category_patterns import list_patterns, decide_pattern, sync_patterns
from app.services.categorization_rules import delete_categorization_rule, update_categorization_rule
from app.services.transactions import update_transaction_category
from app.services.statements import delete_statement, _categorize
from tests.fixtures import Session
from tests import test_personalized_categorization as fixtures


class AutomaticLearningTests(unittest.TestCase):
    setUp = fixtures.PersonalizedCategorizationTests.setUp
    tearDown = fixtures.PersonalizedCategorizationTests.tearDown
    _transaction = fixtures.PersonalizedCategorizationTests._transaction

    def examples(self, session, n=3, description="Almacen Rosita"):
        results = []
        for _ in range(n):
            tx = self._transaction(session, description)
            results.append(update_transaction_category(session, tx.id, self.groceries_id))
        return results

    def pattern(self, session, description="almacen rosita"):
        return next(item for item in list_patterns(session) if item["pattern"] == description)

    def test_changes_automatically_learn_exact_normalized_patterns_and_persist(self):
        with Session(self.engine) as session:
            for name in ("ALMACEN ROSITA", "Almacen  Rosita", "Almacen * Rosita"):
                self.examples(session, 1, name)
            item = self.pattern(session)
            self.assertEqual((item["state"], item["evidence_count"], item["decision_count"]), ("pending", 3, 3))
            self.assertEqual(len(item["examples"]), 3)
            self.assertIsNone(_categorize(session, "Almacen Rosita", "expense")[0])
            session.commit()
        with Session(self.engine) as session:
            self.assertEqual(self.pattern(session)["id"], item["id"])
            self.assertEqual(len(session.exec(select(CategoryPatternModel)).all()), 1)

    def test_noop_and_repeated_confirmations_never_inflate_evidence(self):
        with Session(self.engine) as session:
            saved = self.examples(session, 1)[0]
            noop = update_transaction_category(session, saved.id, self.groceries_id)
            self.assertEqual(noop.category_version, saved.category_version)
            for _ in range(4):
                update_transaction_category(session, saved.id, self.groceries_id, action="confirm")
            item = self.pattern(session)
            self.assertEqual((item["state"], item["evidence_count"], item["decision_count"]), ("observing", 1, 1))

    def test_rejected_choice_survives_more_evidence_and_requires_reactivation(self):
        with Session(self.engine) as session:
            self.examples(session)
            item = self.pattern(session)
            decide_pattern(session, item["id"], "reject", item["version"])
            self.examples(session, 2)
            item = self.pattern(session)
            self.assertEqual(item["state"], "rejected")
            self.assertEqual(item["evidence_count"], 5)
            decide_pattern(session, item["id"], "reactivate", item["version"])
            self.assertEqual(self.pattern(session)["state"], "pending")

    def test_snooze_expiry_and_loss_of_evidence_are_rechecked(self):
        with Session(self.engine) as session:
            self.examples(session)
            item = self.pattern(session)
            decide_pattern(session, item["id"], "snooze", item["version"])
            self.assertEqual(self.pattern(session)["state"], "snoozed")
            row = session.get(CategoryPatternModel, item["id"])
            row.snoozed_until = datetime.now(timezone.utc) - timedelta(seconds=1)
            session.add(row); session.commit()
            item = self.pattern(session)
            self.assertEqual(item["state"], "pending")
            decide_pattern(session, item["id"], "snooze", item["version"])
            delete_statement(session, self.statement_id)
            self.assertEqual(self.pattern(session)["state"], "inactive")

    def test_accept_is_idempotent_and_pausing_or_deleting_does_not_repropose(self):
        with Session(self.engine) as session:
            self.examples(session)
            item = self.pattern(session)
            rule = decide_pattern(session, item["id"], "accept", item["version"])
            repeated = decide_pattern(session, item["id"], "accept", item["version"])
            self.assertEqual(rule.id, repeated.id)
            self.assertEqual(_categorize(session, "Almacen Rosita", "expense")[0], self.groceries_id)
            update_categorization_rule(session, rule.id, is_active=False)
            self.examples(session, 1)
            self.assertEqual(self.pattern(session)["state"], "accepted")
            delete_categorization_rule(session, rule.id)
            self.assertEqual(self.pattern(session)["state"], "accepted")
            with self.assertRaises(CategoryConflictError):
                decide_pattern(session, item["id"], "accept", item["version"])
            self.assertTrue(all(tx.category_source.value == "manual" for tx in session.exec(select(TransactionModel)).all()))

    def test_stale_proposal_cannot_create_rule_after_undo(self):
        with Session(self.engine) as session:
            saved = self.examples(session)
            item = self.pattern(session)
            last = saved[-1]
            undo_decision(session, last.id, last.category_event_id, last.category_version)
            with self.assertRaises(CategoryConflictError):
                decide_pattern(session, item["id"], "accept", item["version"])
            self.assertEqual(self.pattern(session)["state"], "observing")
            self.assertEqual(session.exec(select(CategorizationRuleModel).where(CategorizationRuleModel.origin == "accepted")).all(), [])

    def test_one_bulk_action_is_one_independent_decision(self):
        with Session(self.engine) as session:
            for _ in range(5):
                tx = self._transaction(session, "Almacen Rosita")
                record_decision(session, tx, self.groceries_id, decision_group="one-bulk-action")
                session.commit()
            item = self.pattern(session)
            self.assertEqual((item["evidence_count"], item["decision_count"], item["state"]), (5, 1, "observing"))

    def test_contradictions_block_even_with_a_large_majority(self):
        with Session(self.engine) as session:
            self.examples(session, 5)
            tx = self._transaction(session, "Almacen Rosita")
            update_transaction_category(session, tx.id, self.food_id)
            self.assertEqual(self.pattern(session)["state"], "conflict")
            self.assertIsNone(self.pattern(session)["category_id"])

    def test_generalization_and_generic_descriptors_are_not_assumed(self):
        with Session(self.engine) as session:
            for text in ("Almacen Rosita 1", "Almacen Rosita 2", "Almacen Rosita 3"):
                self.examples(session, 1, text)
            self.examples(session, 3, "Mercado Pago")
            self.assertTrue(all(item["state"] == "observing" for item in list_patterns(session)))

    def test_broader_existing_rule_prevents_duplicate_and_manual_conflict_is_visible(self):
        with Session(self.engine) as session:
            rule = CategorizationRuleModel(keyword="almacen", category_id=self.groceries_id, origin="user")
            session.add(rule); session.commit()
            self.examples(session)
            self.assertEqual(self.pattern(session)["state"], "covered")
            update_categorization_rule(session, rule.id, category_id=self.food_id)
            self.assertEqual(self.pattern(session)["state"], "conflict")

    def test_forgetting_suppresses_future_learning_and_undo(self):
        with Session(self.engine) as session:
            self.examples(session)
            forget_pattern(session, "almacen rosita", self._transaction(session).transaction_type)
            last = self.examples(session, 1)[0]
            undo_decision(session, last.id, last.category_event_id, last.category_version)
            self.examples(session, 1)
            self.assertIsNone(memory_suggestion(session, "Almacen Rosita", last.transaction_type))
            self.assertEqual(self.pattern(session)["state"], "rejected")

    def test_legacy_unremembered_events_are_not_reactivated(self):
        with Session(self.engine) as session:
            for _ in range(3):
                tx = self._transaction(session, "Historial olvidado", self.groceries_id)
                tx.category_reviewed = True
                session.add(tx)
                session.add(CategoryFeedbackModel(transaction_id=tx.id, category_id=self.groceries_id,
                    pattern="historial olvidado", remembered=False))
            session.commit()
            self.assertEqual(list_patterns(session), [])

    def test_pattern_identifiers_and_history_are_private_to_the_owner(self):
        with Session(self.engine) as session:
            self.examples(session)
            item = self.pattern(session)
            session.commit()
            other = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
            session.add(UserModel(id=other)); session.commit()
        with TenantSession(self.engine, user_id=other) as session:
            self.assertEqual(list_patterns(session), [])
            with self.assertRaises(LookupError):
                decide_pattern(session, item["id"], "accept", item["version"])
