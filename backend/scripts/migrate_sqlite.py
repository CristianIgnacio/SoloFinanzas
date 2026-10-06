"""Read-only SQLite import. Defaults to a complete transactional rehearsal/rollback."""
import argparse
from contextlib import closing
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import text
from sqlmodel import Session, select
from app.core.database import make_engine
from app.core.config import settings
from app.models import AccountModel, CategoryModel, CategorizationRuleModel, StatementModel, TransactionModel, InternalTransferMatchModel
from app.models.user import UserModel

MODELS = (AccountModel, CategoryModel, CategorizationRuleModel, StatementModel, TransactionModel, InternalTransferMatchModel)
REFERENCES = {'parent_id': 'categories', 'category_id': 'categories', 'account_id': 'accounts',
    'statement_id': 'statements', 'rule_id_applied': 'categorization_rules',
    'outgoing_transaction_id': 'transactions', 'incoming_transaction_id': 'transactions'}


def read_source(path):
    if not path.is_file(): raise ValueError('La copia SQLite no existe.')
    with closing(sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)) as conn:
        conn.row_factory = sqlite3.Row
        if conn.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('La copia SQLite no supera integrity_check.')
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if 'users' in tables: raise ValueError('El origen debe ser la instalación local anterior, sin usuarios.')
        return {m.__tablename__: [dict(r) for r in conn.execute('SELECT * FROM ' + m.__tablename__)]
                if m.__tablename__ in tables else [] for m in MODELS}


def monthly(rows):
    result = defaultdict(lambda: [0, 0, 0, 0])
    for r in rows:
        key = (r['account_id'], str(r['date'])[:7])
        value = result[key]
        amount = r['amount_clp']
        value[0] += 1; value[1] += amount
        value[2] += max(0, amount); value[3] += min(0, amount)
    return dict(result)


def migrate(source: Path, engine, owner: UUID, apply=False):
    data = read_source(source)
    if not data['accounts']: raise ValueError('El origen no contiene cuentas.')
    mappings = {m.__tablename__: {} for m in MODELS}
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            if connection.dialect.name == 'postgresql':
                # Coordinate with normal API owner locks for the entire import.
                from hashlib import blake2b
                key = int.from_bytes(blake2b(owner.bytes, digest_size=8).digest(), 'big', signed=True)
                connection.execute(text('SELECT pg_advisory_xact_lock(:key)'), {'key': key})
            with Session(connection, join_transaction_mode='rollback_only') as session:
                if session.exec(select(AccountModel).where(AccountModel.user_id == owner)).first():
                    raise ValueError('El usuario destino ya tiene cuentas. No se sobrescribe su historial.')
                profile = session.get(UserModel, owner)
                if profile and profile.deletion_pending: raise ValueError('La cuenta destino está eliminada.')
                if not profile:
                    profile = UserModel(id=owner)
                    session.add(profile); session.flush()
                # Replace only this user's unused bootstrap defaults.
                for model in (CategorizationRuleModel, CategoryModel):
                    rows = session.exec(select(model).where(model.user_id == owner)).all()
                    if model is CategoryModel: rows.sort(key=lambda r: r.parent_id is None)
                    for row in rows: session.delete(row); session.flush()
                for model in MODELS:
                    table = model.__tablename__
                    rows = data[table]
                    if model is CategoryModel: rows = sorted(rows, key=lambda r: r.get('parent_id') is not None)
                    for original in rows:
                        payload = {k: v for k, v in original.items() if k in model.model_fields and k not in ('id', 'user_id', 'raw_path', 'raw_data')}
                        for column, target in REFERENCES.items():
                            if payload.get(column) is not None:
                                payload[column] = mappings[target][payload[column]]
                        payload['user_id'] = owner
                        if model is TransactionModel:
                            fingerprint = f"{payload['account_id']}|{str(payload['date'])[:10]}|{payload['normalized_description'].strip().lower()}|{payload['amount_clp']}"
                            payload['fingerprint'] = hashlib.sha256(fingerprint.encode()).hexdigest()
                        row = model.model_validate(payload)
                        session.add(row); session.flush()
                        mappings[table][original['id']] = row.id
                actual = [r.model_dump(mode='json') for r in session.exec(select(TransactionModel).where(TransactionModel.user_id == owner)).all()]
                expected = [{**r, 'account_id': mappings['accounts'][r['account_id']]} for r in data['transactions']]
                if monthly(actual) != monthly(expected): raise ValueError('Difieren cantidades o totales por cuenta y mes.')
                for model in MODELS:
                    count = len(session.exec(select(model).where(model.user_id == owner)).all())
                    if count != len(data[model.__tablename__]): raise ValueError('Difieren las cantidades importadas.')
                expected_categories = Counter(mappings['categories'].get(r.get('category_id')) for r in data['transactions'])
                if Counter(r['category_id'] for r in actual) != expected_categories:
                    raise ValueError('Difieren las clasificaciones originales.')
                profile.initialized = True
                session.add(profile); session.flush()
                # Flush is enough; outer transaction owns the final decision.
                session.commit()
            report = {'applied': apply, 'counts': {k: len(v) for k, v in data.items()},
                'account_month_groups_verified': len(monthly(expected)), 'classifications_verified': True,
                'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest()}
            transaction.commit() if apply else transaction.rollback()
            return report
        except Exception:
            transaction.rollback()
            raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True, help='Copia consistente de SQLite, nunca se modifica.')
    parser.add_argument('--owner', type=UUID, required=True, help='UUID explícito de Supabase Auth, no un correo.')
    parser.add_argument('--apply', action='store_true', help='Confirma la importación; sin esto se revierte todo.')
    args = parser.parse_args()
    engine = make_engine(settings.database_url)
    try:
        print(json.dumps(migrate(args.source, engine, args.owner, args.apply), indent=2))
    except Exception:
        print('Migración rechazada y revertida. Revisa el origen, UUID, relaciones, duplicados y acceso al destino.', file=sys.stderr)
        return 1
    finally: engine.dispose()
    return 0


if __name__ == '__main__': sys.exit(main())
