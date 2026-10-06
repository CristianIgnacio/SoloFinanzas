from datetime import date

from sqlmodel import Session, select
from sqlalchemy import func, or_

from app.domain.enums import CategoryType, TransactionType
from app.models.category import CategoryModel
from app.models.internal_transfer_match import InternalTransferMatchModel
from app.models.transaction import TransactionModel
from app.schemas.transaction import Transaction, TransactionCreate
from app.services.internal_transfers import refresh_internal_transfer_matches


def _matched_transaction_ids(session: Session) -> set[int]:
    matches = session.exec(select(InternalTransferMatchModel)).all()
    return {
        transaction_id
        for match in matches
        for transaction_id in (
            match.outgoing_transaction_id,
            match.incoming_transaction_id,
        )
    }


def _to_transaction(
    transaction: TransactionModel,
    matched_ids: set[int],
) -> Transaction:
    return Transaction.model_validate(transaction).model_copy(
        update={"is_internal_transfer": transaction.id in matched_ids}
    )


def create_transaction(session: Session, payload: TransactionCreate) -> Transaction:
    """Crea una transaccion individual desde el payload validado."""
    transaction = TransactionModel(
        account_id=payload.account_id,
        statement_id=payload.statement_id,
        source_row=payload.source_row,
        date=payload.date,
        description=payload.description,
        normalized_description=payload.normalized_description,
        amount_clp=payload.amount_clp,
        transaction_type=payload.transaction_type,
        category_id=payload.category_id,
        category_source=payload.category_source,
        rule_id_applied=payload.rule_id_applied,
        fingerprint=payload.fingerprint,
        raw_data=payload.raw_data,
    )
    session.add(transaction)
    refresh_internal_transfer_matches(session)
    session.commit()
    session.refresh(transaction)
    return _to_transaction(transaction, _matched_transaction_ids(session))


def create_bulk_transactions(
    session: Session, transactions: list[TransactionCreate]
) -> list[Transaction]:
    """Crea multiples transacciones en una sola operacion de sesion."""
    models = [TransactionModel(**t.model_dump()) for t in transactions]
    session.add_all(models)
    refresh_internal_transfer_matches(session)
    session.commit()
    for model in models:
        session.refresh(model)
    matched_ids = _matched_transaction_ids(session)
    return [_to_transaction(t, matched_ids) for t in models]


def list_transactions(
    session: Session,
    account_id: int | None = None,
    statement_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    transaction_type: str | None = None,
    category_id: int | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[Transaction]:
    """Lista transacciones aplicando filtros y paginacion opcionales."""
    query = transaction_query(session, account_id, statement_id, date_from, date_to, transaction_type, category_id)
    query = query.order_by(TransactionModel.date.desc(), TransactionModel.id.desc())
    transactions = session.exec(query.limit(limit).offset(offset)).all()
    matched_ids = _matched_transaction_ids(session)
    return [_to_transaction(t, matched_ids) for t in transactions]


def get_transaction(session: Session, transaction_id: int) -> Transaction | None:
    """Obtiene una transaccion por ID."""
    transaction = session.exec(
        select(TransactionModel).where(TransactionModel.id == transaction_id)
    ).first()
    if not transaction:
        return None
    return _to_transaction(transaction, _matched_transaction_ids(session))


def update_transaction_category(
    session: Session,
    transaction_id: int,
    category_id: int | None,
    category_source: str | None = None,
) -> Transaction | None:
    """Actualiza la categoria manual o automatica de una transaccion."""
    transaction = session.exec(
        select(TransactionModel).where(TransactionModel.id == transaction_id)
    ).first()
    if transaction:
        if category_id is not None:
            category = session.get(CategoryModel, category_id)
            if category is None:
                raise ValueError("La categoria seleccionada no existe.")
            if not category.is_active:
                raise ValueError("La categoria seleccionada esta archivada.")

            direction_type = (
                CategoryType.INCOME
                if transaction.transaction_type == TransactionType.INCOME
                else CategoryType.EXPENSE
            )
            if category.type not in {direction_type, CategoryType.TRANSFER}:
                raise ValueError(
                    "La categoria debe coincidir con la direccion del movimiento "
                    "o ser una transferencia."
                )

        transaction.category_id = category_id
        transaction.category_source = category_source
        transaction.rule_id_applied = None
        session.add(transaction)
        refresh_internal_transfer_matches(session)
        session.commit()
        session.refresh(transaction)
        return _to_transaction(transaction, _matched_transaction_ids(session))
    return None


def count_transactions(
    session: Session,
    account_id: int | None = None,
    statement_id: int | None = None,
) -> int:
    """Cuenta transacciones aplicando filtros opcionales de cuenta o cartola."""
    query = select(TransactionModel)
    if account_id is not None:
        query = query.where(TransactionModel.account_id == account_id)
    if statement_id is not None:
        query = query.where(TransactionModel.statement_id == statement_id)

    return session.exec(query).all().__len__()


def transaction_query(session, account_id=None, statement_id=None, date_from=None, date_to=None,
                      transaction_type=None, category_id=None, uncategorized=False, exclude_internal=False):
    query = select(TransactionModel)

    if account_id is not None:
        query = query.where(TransactionModel.account_id == account_id)
    if statement_id is not None:
        query = query.where(TransactionModel.statement_id == statement_id)
    if date_from is not None:
        query = query.where(TransactionModel.date >= date_from)
    if date_to is not None:
        query = query.where(TransactionModel.date <= date_to)
    if transaction_type is not None:
        query = query.where(TransactionModel.transaction_type == transaction_type)
    if category_id is not None:
        child_ids = session.exec(
            select(CategoryModel.id).where(CategoryModel.parent_id == category_id)
        ).all()
        query = query.where(
            TransactionModel.category_id.in_([category_id, *child_ids])
        )

    if uncategorized:
        query = query.where(TransactionModel.category_id.is_(None))
    if exclude_internal:
        matched = select(InternalTransferMatchModel.id).where(or_(
            InternalTransferMatchModel.outgoing_transaction_id == TransactionModel.id,
            InternalTransferMatchModel.incoming_transaction_id == TransactionModel.id)).exists()
        query = query.where(~matched)
    return query


def transaction_page(session, limit=50, offset=0, **filters):
    query = transaction_query(session, **filters)
    total = session.exec(query.with_only_columns(func.count(TransactionModel.id))).one()
    rows = session.exec(query.order_by(TransactionModel.date.desc(), TransactionModel.id.desc()).limit(limit).offset(offset)).all()
    matched = _matched_transaction_ids(session)
    return dict(items=[_to_transaction(row, matched) for row in rows], total=total, limit=limit, offset=offset)
