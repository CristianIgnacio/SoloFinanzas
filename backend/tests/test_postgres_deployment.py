"""Creates and removes isolated synthetic databases; never uses DATABASE_URL."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from uuid import uuid4
from urllib.parse import urlsplit, urlunsplit
import psycopg
from psycopg import sql
from cryptography.fernet import Fernet
from sqlmodel import Session
from app.core.database import make_engine
from app.models import AccountModel
from app.models.user import UserModel


@unittest.skipUnless(os.getenv('TEST_POSTGRES_ADMIN_URL'), 'Requires a disposable PostgreSQL test server')
class PostgresDeploymentTests(unittest.TestCase):
    def test_migrations_private_permissions_backup_and_restore(self):
        url = os.environ['TEST_POSTGRES_ADMIN_URL']
        base = urlsplit(url)
        names = ['sf_test_' + uuid4().hex for _ in range(2)]
        backend = Path(__file__).resolve().parents[1]
        with psycopg.connect(url, autocommit=True) as admin:
            try:
                for name in names: admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
                urls = [urlunsplit(base._replace(path='/' + name)) for name in names]
                env = {**os.environ, 'DATABASE_URL': urls[0]}
                subprocess.run([sys.executable, '-m', 'alembic', 'upgrade', 'head'], cwd=backend, env=env, check=True, capture_output=True)
                with psycopg.connect(urls[0]) as db:
                    self.assertEqual(db.execute("SELECT count(*) FROM finance.alembic_version").fetchone()[0], 1)
                    # Runtime grants must not include schema mutation or migrations.
                    db.execute((backend / 'scripts/runtime-role.sql').read_text())
                    self.assertFalse(db.execute("SELECT has_schema_privilege('finance_api', 'finance', 'CREATE')").fetchone()[0])
                    self.assertFalse(db.execute("SELECT has_table_privilege('finance_api', 'finance.alembic_version', 'UPDATE')").fetchone()[0])
                engine = make_engine(urls[0])
                with Session(engine) as session:
                    owner = uuid4()
                    session.add(UserModel(id=owner, initialized=True)); session.flush()
                    session.add(AccountModel(user_id=owner, name='Synthetic restore', account_type='debito')); session.commit()
                engine.dispose()
                with tempfile.TemporaryDirectory() as directory:
                    env.update(BACKUP_DATABASE_URL=urls[0], BACKUP_KEY=Fernet.generate_key().decode(), BACKUP_SSLMODE='disable')
                    subprocess.run([sys.executable, 'scripts/backup.py', '--directory', directory], cwd=backend, env=env, check=True, capture_output=True)
                    archive = next(Path(directory).glob('*.enc'))
                    env['BACKUP_DATABASE_URL'] = urls[1]
                    subprocess.run([sys.executable, 'scripts/backup.py', '--restore', str(archive)], cwd=backend, env=env, check=True, capture_output=True)
                with psycopg.connect(urls[1]) as restored:
                    self.assertEqual(restored.execute('SELECT name FROM finance.accounts').fetchall(), [('Synthetic restore',)])
                    self.assertEqual(restored.execute('SELECT id FROM finance.users').fetchone()[0], owner)
            finally:
                for name in names:
                    admin.execute(sql.SQL('DROP DATABASE IF EXISTS {} WITH (FORCE)').format(sql.Identifier(name)))
