from datetime import date
import unittest

from sqlmodel import select

from app.core.tenancy import TenantSession
from app.models import TransactionModel, CategorizationRuleModel, CategoryFeedbackModel
from app.domain.enums import TransactionType
from app.schemas.transaction import ManualTransactionInput
from app.services.cash_transactions import create_manual_transaction, update_manual_transaction
from app.services.category_patterns import list_patterns
from app.services.transactions import update_transaction_category
from tests import test_tenancy as fixtures
from tests import test_cash_transactions as cash_fixtures


class LearningApiTests(unittest.TestCase):
    setUp = fixtures.TenancyTests.setUp
    tearDown = fixtures.TenancyTests.tearDown

    def prepare(self, owner=fixtures.A):
        with TenantSession(self.engine, user_id=owner) as session:
            account, category, statement, _ = self.records[owner]
            for day in range(1, 4):
                tx = TransactionModel(account_id=account, statement_id=statement,
                    date=date(2026, 1, day), description="Almacen Lucero", normalized_description="almacen lucero",
                    amount_clp=-100, transaction_type=TransactionType.EXPENSE)
                session.add(tx); session.commit()
                update_transaction_category(session, tx.id, category)
            item = list_patterns(session)[0]
            session.commit()
            return item

    def test_accept_requires_current_version_and_is_retry_safe(self):
        item = self.prepare()
        url = f'/api/v1/categorization-rules/patterns/{item["id"]}/decision'
        stale = self.client.post(url, json={"action": "accept", "expected_version": item["version"] - 1})
        self.assertEqual(stale.status_code, 409)
        body = {"action": "accept", "expected_version": item["version"]}
        first = self.client.post(url, json=body)
        second = self.client.post(url, json=body)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(second.status_code, 200, second.text)
        self.assertEqual(first.json()["id"], second.json()["id"])
        with TenantSession(self.engine, user_id=fixtures.A) as session:
            self.assertEqual(len(session.exec(select(CategorizationRuleModel).where(CategorizationRuleModel.origin == "accepted")).all()), 1)

    def test_other_owner_patterns_cannot_be_read_decided_or_exported(self):
        item = self.prepare(fixtures.B)
        self.assertEqual(self.client.get('/api/v1/categorization-rules/patterns').json(), [])
        response = self.client.post(f'/api/v1/categorization-rules/patterns/{item["id"]}/decision',
            json={"action": "reject", "expected_version": item["version"]})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(self.client.get('/api/v1/me/export').json()["category_patterns"], [])

    def test_rejection_is_durable_across_api_requests(self):
        item = self.prepare()
        url = f'/api/v1/categorization-rules/patterns/{item["id"]}/decision'
        response = self.client.post(url, json={"action": "reject", "expected_version": item["version"]})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.client.get('/api/v1/categorization-rules/proposals').json(), [])
        patterns = self.client.get('/api/v1/categorization-rules/patterns').json()
        self.assertEqual(patterns[0]["state"], "rejected")
        self.assertEqual(patterns[0]["history"][-1]["state"], "rejected")

    def test_parallel_accepts_create_one_rule_on_postgres(self):
        if self.engine.dialect.name != "postgresql":
            self.skipTest("Requires disposable PostgreSQL for row-lock concurrency")
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        from app.services.category_patterns import decide_pattern
        item = self.prepare()
        barrier = Barrier(2)

        def accept():
            with TenantSession(self.engine, user_id=fixtures.A) as session:
                barrier.wait(timeout=10)
                return decide_pattern(session, item["id"], "accept", item["version"]).id

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(accept) for _ in range(2)]
            ids = [future.result(timeout=20) for future in futures]
        self.assertEqual(ids[0], ids[1])
        with TenantSession(self.engine, user_id=fixtures.A) as session:
            self.assertEqual(len(session.exec(select(CategorizationRuleModel).where(CategorizationRuleModel.origin == "accepted")).all()), 1)


class CashLearningTests(unittest.TestCase):
    setUp = cash_fixtures.CashTransactionTests.setUp
    tearDown = cash_fixtures.CashTransactionTests.tearDown

    def test_cash_creation_learns_and_metadata_edits_preserve_evidence(self):
        with TenantSession(self.engine, user_id=cash_fixtures.OWNER) as session:
            payload = ManualTransactionInput(transaction_type=TransactionType.EXPENSE, amount_clp=100,
                date=date(2026, 1, 1), description="Almacen Lucero", category_id=self.expense_id)
            for _ in range(3):
                created = create_manual_transaction(session, payload)
            self.assertEqual(list_patterns(session)[0]["state"], "pending")
            events = len(session.exec(select(CategoryFeedbackModel)).all())
            update_manual_transaction(session, created.id, payload.model_copy(update={"amount_clp": 200}))
            self.assertEqual(len(session.exec(select(CategoryFeedbackModel)).all()), events)
            update_manual_transaction(session, created.id, payload.model_copy(update={"description": "Otro comercio"}))
            patterns = {item["pattern"]: item for item in list_patterns(session)}
            self.assertEqual(patterns["almacen lucero"]["evidence_count"], 2)
            self.assertEqual(patterns["almacen lucero"]["state"], "observing")
            self.assertEqual(patterns["otro comercio"]["evidence_count"], 1)

    def test_category_undo_cannot_restore_an_expense_category_after_direction_changed(self):
        from app.services.category_feedback import latest_event, undo_decision, CategoryConflictError
        with TenantSession(self.engine, user_id=cash_fixtures.OWNER) as session:
            payload = ManualTransactionInput(transaction_type=TransactionType.EXPENSE, amount_clp=100,
                date=date(2026, 1, 1), description="Almacen Lucero", category_id=self.expense_id)
            created = create_manual_transaction(session, payload)
            updated = update_manual_transaction(session, created.id, payload.model_copy(update={
                "transaction_type": TransactionType.INCOME, "category_id": self.income_id}))
            event = latest_event(session, created.id)
            with self.assertRaises(CategoryConflictError):
                undo_decision(session, created.id, event.id, updated.category_version)
            self.assertEqual(session.get(TransactionModel, created.id).category_id, self.income_id)
