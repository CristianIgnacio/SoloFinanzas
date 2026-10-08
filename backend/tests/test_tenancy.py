"""Synthetic users only. TEST_DATABASE_URL enables the same suite on PostgreSQL."""
import os
import tempfile
import unittest
from datetime import date
from pathlib import Path
from uuid import UUID
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import func, text
from sqlalchemy.orm import aliased
from sqlmodel import SQLModel, Session, select

from app.core import database
from app.core.auth import Identity, get_identity
from app.core.tenancy import TenantSession
from app.models import AccountModel, CategoryModel, StatementModel, TransactionModel, CategorizationRuleModel, InternalTransferMatchModel
from app.models.user import UserModel
from app.main import app

A = UUID('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
B = UUID('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')


class TenancyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.engine = database.make_engine(os.getenv('TEST_DATABASE_URL') or
            'sqlite:///' + (Path(self.tmp.name) / 'test.db').as_posix())
        SQLModel.metadata.create_all(self.engine)
        with Session(self.engine) as s:
            for owner in (A, B):
                s.add(UserModel(id=owner, initialized=True))
            s.commit()
        self.records = {}
        for owner in (A, B):
            with TenantSession(self.engine, user_id=owner) as s:
                account = AccountModel(name='Demo', account_type='debito')
                category = CategoryModel(name='Demo', type='expense')
                s.add_all([account, category]); s.flush()
                statement = StatementModel(account_id=account.id, file_name='demo.pdf', file_type='pdf', file_checksum='same-file')
                s.add(statement); s.flush()
                txn = TransactionModel(account_id=account.id, statement_id=statement.id,
                    date=date(2026, 1, 1), description='Demo', normalized_description='demo',
                    amount_clp=-100, transaction_type='expense', category_id=category.id)
                s.add(txn); s.commit()
                self.records[owner] = (account.id, category.id, statement.id, txn.id)
        self.engine_patch = patch.object(database, 'engine', self.engine)
        self.engine_patch.start()
        app.dependency_overrides[get_identity] = lambda: Identity(A, 'demo@example.test', 'Demo', {})
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()
        self.engine_patch.stop()
        SQLModel.metadata.drop_all(self.engine)
        self.engine.dispose()
        self.tmp.cleanup()

    def test_select_aggregate_alias_and_identity_map_are_scoped(self):
        for owner in (A, B):
            with TenantSession(self.engine, user_id=owner) as s:
                self.assertEqual(len(s.exec(select(AccountModel)).all()), 1)
                self.assertEqual(s.exec(select(func.sum(TransactionModel.amount_clp))).one(), -100)
                alias = aliased(TransactionModel)
                self.assertEqual(len(s.exec(select(alias)).all()), 1)
                other = B if owner == A else A
                self.assertIsNone(s.get(AccountModel, self.records[other][0]))
                with self.assertRaises(RuntimeError):
                    s.exec(text('SELECT * FROM accounts'))

    def test_cross_owner_relationships_and_owner_changes_fail(self):
        with TenantSession(self.engine, user_id=A) as s:
            txn = s.get(TransactionModel, self.records[A][3])
            txn.category_id = self.records[B][1]
            with self.assertRaises(HTTPException): s.flush()
            s.rollback()
            account = s.get(AccountModel, self.records[A][0])
            account.user_id = B
            with self.assertRaises(HTTPException): s.flush()

    def test_database_rejects_cross_owner_references_without_orm_guard(self):
        from sqlalchemy.exc import IntegrityError
        with Session(self.engine) as s:
            txn = s.get(TransactionModel, self.records[A][3])
            txn.category_id = self.records[B][1]
            with self.assertRaises(IntegrityError): s.commit()

    def test_owner_in_form_is_ignored(self):
        result = self.client.post('/api/v1/accounts', json={'name': 'Demo extra', 'account_type': 'debito', 'user_id': str(B)})
        self.assertEqual(result.status_code, 201)
        with TenantSession(self.engine, user_id=A) as s:
            self.assertIsNotNone(s.get(AccountModel, result.json()['id']))
        with TenantSession(self.engine, user_id=B) as s:
            self.assertIsNone(s.get(AccountModel, result.json()['id']))

    def test_account_product_mismatch_is_rejected(self):
        valid = self.client.post('/api/v1/accounts', json={
            'name': 'CuentaRUT para gastos',
            'institution': 'banco_estado',
            'account_type': 'vista',
            'product_code': 'banco_estado_cuenta_rut',
        })
        self.assertEqual(valid.status_code, 201)
        self.assertEqual(valid.json()['product_code'], 'banco_estado_cuenta_rut')
        response = self.client.post('/api/v1/accounts', json={
            'name': 'Otra cuenta',
            'institution': 'banco_de_chile',
            'account_type': 'vista',
            'product_code': 'banco_estado_cuenta_rut',
        })
        self.assertEqual(response.status_code, 422)
        self.assertIn('institución', response.json()['detail'])

    def test_account_products_endpoint_exposes_catalog(self):
        response = self.client.get('/api/v1/account-products')
        self.assertEqual(response.status_code, 200)
        products = {item['code']: item for item in response.json()}
        self.assertEqual(products['banco_estado_cuenta_rut']['kind'], 'vista')
        self.assertEqual(products['banco_estado_cuenta_rut']['pdf_support'], 'muestra_probada')
        self.assertNotIn('parser_key', products['banco_estado_cuenta_rut'])
        for code, kind in (
            ('banco_de_chile_corriente_tradicional', 'corriente'),
            ('banco_estado_cuenta_pro', 'vista'),
            ('banco_falabella_vista', 'vista'),
        ):
            with self.subTest(code=code):
                self.assertEqual(products[code]['kind'], kind)
                self.assertEqual(products[code]['pdf_support'], 'pendiente_verificacion')

    def test_linking_product_keeps_statement_and_transaction_filters(self):
        account_id, _, statement_id, transaction_id = self.records[A]
        response = self.client.put(f'/api/v1/accounts/{account_id}', json={
            'name': 'Gastos diarios',
            'institution': 'banco_de_chile',
            'account_type': 'vista',
            'product_code': 'banco_de_chile_cuenta_fan',
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['id'], account_id)
        self.assertEqual(response.json()['product_code'], 'banco_de_chile_cuenta_fan')

        statements = self.client.get(f'/api/v1/statements?account_id={account_id}').json()
        transactions = self.client.get(f'/api/v1/transaction-pages?account_id={account_id}').json()
        self.assertEqual([item['id'] for item in statements], [statement_id])
        self.assertEqual([item['id'] for item in transactions['items']], [transaction_id])
        self.assertEqual(transactions['items'][0]['account_id'], account_id)

    def test_pdf_routes_reject_credit_before_parsing(self):
        created = self.client.post('/api/v1/accounts', json={
            'name': 'Crédito demo', 'institution': 'banco_estado',
            'account_type': 'credito', 'product_code': 'banco_estado_visa_smart',
        })
        self.assertEqual(created.status_code, 201)
        legacy = self.client.post('/api/v1/accounts', json={
            'name': 'Crédito antiguo', 'institution': 'banco_de_chile',
            'account_type': 'credito',
        })
        self.assertEqual(legacy.status_code, 201)
        with patch('app.main.limiter.check'), patch('app.api.routes.statements.inspect_pdf_isolated') as parser:
            for account_id in (created.json()['id'], legacy.json()['id']):
                for suffix in ('/preview', '', '/reviewed'):
                    data = {'account_id': account_id}
                    if suffix == '/reviewed':
                        data['reviewed_transactions'] = '[]'
                    with self.subTest(account_id=account_id, suffix=suffix):
                        response = self.client.post(
                            '/api/v1/statement-imports/pdf' + suffix,
                            data=data,
                            files={'file': ('demo.pdf', b'%PDF-invalid', 'application/pdf')},
                        )
                        self.assertEqual(response.status_code, 422)
                        self.assertIn('crédito', response.json()['detail'])
            parser.assert_not_called()

    def test_pdf_routes_pass_product_or_legacy_parser_to_worker(self):
        sample = self.client.post('/api/v1/accounts', json={
            'name': 'CuentaRUT demo', 'institution': 'banco_estado',
            'account_type': 'vista', 'product_code': 'banco_estado_cuenta_rut',
        })
        pending = self.client.post('/api/v1/accounts', json={
            'name': 'Cuenta FAN demo', 'institution': 'banco_de_chile',
            'account_type': 'vista', 'product_code': 'banco_de_chile_cuenta_fan',
        })
        self.assertEqual(sample.status_code, 201)
        self.assertEqual(pending.status_code, 201)
        cases = (
            (sample.json()['id'], 'banco_estado'),
            (pending.json()['id'], 'banco_de_chile'),
            (self.records[A][0], 'banco_de_chile'),
        )
        with patch('app.main.limiter.check'), patch(
            'app.api.routes.statements.inspect_pdf_isolated',
            side_effect=HTTPException(418, 'parser reached'),
        ) as parser:
            for account_id, expected_parser in cases:
                for suffix in ('/preview', '', '/reviewed'):
                    data = {'account_id': account_id}
                    if suffix == '/reviewed':
                        data['reviewed_transactions'] = '[]'
                    with self.subTest(account_id=account_id, suffix=suffix):
                        response = self.client.post(
                            '/api/v1/statement-imports/pdf' + suffix,
                            data=data,
                            files={'file': ('demo.pdf', b'%PDF-invalid', 'application/pdf')},
                        )
                        self.assertEqual(response.status_code, 418)
                        self.assertEqual(parser.call_args.kwargs['parser_key'], expected_parser)

    def test_routes_cannot_read_modify_delete_or_import_foreign_records(self):
        account, category, statement, txn = self.records[B]
        for path in (f'/transactions/{txn}', f'/statements/{statement}', f'/statements/{statement}/deletion-impact'):
            self.assertEqual(self.client.get('/api/v1' + path).status_code, 404)
        self.assertEqual(self.client.delete(f'/api/v1/accounts/{account}').status_code, 404)
        self.assertEqual(self.client.delete(f'/api/v1/statements/{statement}').status_code, 404)
        self.assertEqual(self.client.patch(f'/api/v1/transactions/{txn}/category', json={'category_id': None}).status_code, 404)
        result = self.client.post('/api/v1/statement-imports/pdf/preview', data={'account_id': account}, files={'file': ('demo.pdf', b'%PDF-invalid', 'application/pdf')})
        self.assertEqual(result.status_code, 404)
        self.assertEqual(len(self.client.get('/api/v1/transactions').json()), 1)
        export = self.client.get('/api/v1/me/export').json()
        self.assertEqual(len(export['transactions']), 1)
        self.assertNotIn('raw_path', export['statements'][0])

    def test_bulk_failure_has_no_partial_commit(self):
        account, category, statement, _ = self.records[A]
        item = dict(account_id=account, statement_id=statement, date='2026-01-02', description='Demo', normalized_description='demo', amount_clp=-30, transaction_type='expense')
        result = self.client.post('/api/v1/transactions/bulk', json=[item, {**item, 'account_id': self.records[B][0]}])
        self.assertEqual(result.status_code, 404)
        with TenantSession(self.engine, user_id=A) as s:
            self.assertEqual(s.exec(select(func.count(TransactionModel.id))).one(), 1)

    def test_deleting_owned_statement_preserves_other_user(self):
        result = self.client.delete(f'/api/v1/statements/{self.records[A][2]}')
        self.assertEqual(result.status_code, 200, result.text)
        with TenantSession(self.engine, user_id=B) as s:
            self.assertEqual(len(s.exec(select(TransactionModel)).all()), 1)

    def test_financial_routes_require_authentication(self):
        app.dependency_overrides.clear()
        self.assertEqual(self.client.get('/api/v1/accounts').status_code, 401)
        self.assertEqual(self.client.get('/api/v1/account-products').status_code, 401)

    def test_reports_and_server_pagination_are_owner_scoped(self):
        report = self.client.get('/api/v1/reports/accounts').json()
        self.assertEqual(len(report), 1)
        self.assertEqual(report[0]['net'], -100)
        self.assertEqual(self.client.get('/api/v1/reports/periods').json(), ['2026-01'])
        page = self.client.get('/api/v1/transaction-pages?limit=1').json()
        self.assertEqual(page['total'], 1)
        self.assertEqual(len(page['items']), 1)
        foreign = self.client.get(f'/api/v1/transaction-pages?account_id={self.records[B][0]}').json()
        self.assertEqual(foreign['total'], 0)
        self.assertEqual(foreign['items'], [])

    def test_foreign_categories_rules_and_transfers_are_rejected(self):
        with TenantSession(self.engine, user_id=B) as s:
            rule = CategorizationRuleModel(keyword='demo', category_id=self.records[B][1])
            s.add(rule); s.commit(); rule_id = rule.id
        self.assertEqual(self.client.get(f'/api/v1/categories/{self.records[B][1]}').status_code, 404)
        self.assertEqual(self.client.patch(f'/api/v1/categories/{self.records[B][1]}', json={'name': 'Changed'}).status_code, 404)
        self.assertEqual(self.client.delete(f'/api/v1/categories/{self.records[B][1]}').status_code, 404)
        self.assertEqual(self.client.patch(f'/api/v1/categorization-rules/{rule_id}?keyword=changed').status_code, 404)
        self.assertEqual(self.client.delete(f'/api/v1/categorization-rules/{rule_id}').status_code, 404)
        result = self.client.post('/api/v1/categorization-rules', json={'keyword': 'demo', 'category_id': self.records[B][1]})
        self.assertIn(result.status_code, (400, 404))
        with TenantSession(self.engine, user_id=A) as s:
            match = InternalTransferMatchModel(outgoing_transaction_id=self.records[A][3], incoming_transaction_id=self.records[B][3], amount_clp=100, date_gap_days=0)
            s.add(match)
            with self.assertRaises(HTTPException): s.flush()

    def test_first_login_seeds_once_and_isolates_defaults(self):
        from uuid import uuid4
        ids = []
        for _ in range(2):
            owner = uuid4()
            ids.append(owner)
            app.dependency_overrides[get_identity] = lambda owner=owner: Identity(owner, 'new@example.test', 'New', {})
            self.assertEqual(self.client.get('/api/v1/me').status_code, 200)
            first = self.client.get('/api/v1/categories').json()
            self.assertGreater(len(first), 0)
            self.assertEqual(self.client.get('/api/v1/categories').json(), first)
        with Session(self.engine) as s:
            sets = [{r.id for r in s.exec(select(CategoryModel).where(CategoryModel.user_id == owner)).all()} for owner in ids]
            self.assertFalse(sets[0] & sets[1])

    def test_concurrent_duplicate_imports_commit_once(self):
        from concurrent.futures import ThreadPoolExecutor
        from app.schemas.transaction import TransactionCandidate
        from app.services.statements import import_pdf_transactions, DuplicateStatementError
        candidate = TransactionCandidate(source_line='demo', date=date(2026, 2, 1),
            description='Demo', normalized_description='demo', amount_clp=-50, transaction_type='expense')
        def perform():
            with database.owner_connection(A) as connection:
                with TenantSession(connection, user_id=A) as s:
                    try:
                        import_pdf_transactions(s, account_id=self.records[A][0], file_name='demo.pdf',
                            file_checksum='concurrent-demo', raw_path=None, period_month='2026-02', candidates=[candidate])
                        return 'created'
                    except DuplicateStatementError:
                        return 'duplicate'
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sorted(pool.map(lambda _: perform(), range(2))), ['created', 'duplicate'])
        with TenantSession(self.engine, user_id=A) as s:
            self.assertEqual(len(s.exec(select(TransactionModel)).all()), 2)
        with TenantSession(self.engine, user_id=B) as s:
            self.assertEqual(len(s.exec(select(TransactionModel)).all()), 1)

    def test_delete_account_is_retryable_and_blocks_stale_tokens(self):
        import time
        import httpx
        from app.core.config import settings
        identity = Identity(A, 'demo@example.test', 'Demo', {'amr': [{'method': 'oauth', 'timestamp': int(time.time())}]})
        app.dependency_overrides[get_identity] = lambda: identity
        with patch.object(settings, 'supabase_service_role_key', 'test-secret'), patch('app.api.routes.profile.httpx.delete', side_effect=httpx.ConnectError('offline')):
            self.assertEqual(self.client.delete('/api/v1/me').status_code, 503)
        self.assertEqual(self.client.get('/api/v1/accounts').status_code, 403)
        self.assertEqual(self.client.get('/api/v1/me').status_code, 200)
        with patch.object(settings, 'supabase_service_role_key', 'test-secret'), patch('app.api.routes.profile.httpx.delete', return_value=httpx.Response(204)):
            self.assertEqual(self.client.delete('/api/v1/me').status_code, 204)
        with TenantSession(self.engine, user_id=A) as s:
            self.assertEqual(s.exec(select(TransactionModel)).all(), [])
        with TenantSession(self.engine, user_id=B) as s:
            self.assertEqual(len(s.exec(select(TransactionModel)).all()), 1)

    def test_modern_supabase_secret_key_is_used_for_auth_deletion(self):
        import time
        import httpx
        from app.core.config import settings
        identity = Identity(A, 'demo@example.test', 'Demo', {'amr': [{'method': 'oauth', 'timestamp': int(time.time())}]})
        app.dependency_overrides[get_identity] = lambda: identity
        with patch.object(settings, 'supabase_secret_key', 'sb_secret_example'), \
             patch.object(settings, 'supabase_service_role_key', 'legacy-example'), \
             patch('app.api.routes.profile.httpx.delete', return_value=httpx.Response(204)) as admin_delete:
            self.assertEqual(self.client.delete('/api/v1/me').status_code, 204)
            headers = admin_delete.call_args.kwargs['headers']
            self.assertEqual(headers['apikey'], 'sb_secret_example')
            self.assertEqual(headers['Authorization'], 'Bearer sb_secret_example')
