"""Create and maintain user-entered movements in the cash account."""

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlmodel import Session, select

from app.domain.enums import AccountKind, CategorySource, CategoryType, TransactionOrigin, TransactionType
from app.models.account import AccountModel
from app.models.category import CategoryModel
from app.models.transaction import TransactionModel
from app.schemas.transaction import ManualTransactionInput, Transaction
from app.services.internal_transfers import refresh_internal_transfer_matches
from app.services.transactions import _matched_transaction_ids, _to_transaction


def get_cash_account(session: Session) -> AccountModel:
    owner = session.info["user_id"]
    account = session.exec(select(AccountModel).where(
        AccountModel.user_id == owner,
        AccountModel.account_kind == AccountKind.CASH,
    )).first()
    if account is None:
        raise HTTPException(404, "La cuenta Efectivo no existe.")
    return account


def _validated_category(session: Session, payload: ManualTransactionInput) -> int | None:
    if payload.category_id is None:
        return None
    category = session.get(CategoryModel, payload.category_id)
    if category is None or not category.is_active:
        raise HTTPException(422, "Selecciona una categoría activa.")
    expected = (
        CategoryType.INCOME if payload.transaction_type == TransactionType.INCOME
        else CategoryType.EXPENSE
    )
    if category.type != expected:
        raise HTTPException(422, "La categoría debe corresponder al tipo de movimiento.")
    return category.id


def _apply_payload(
    transaction: TransactionModel, payload: ManualTransactionInput, category_id: int | None,
) -> None:
    description = " ".join(payload.description.split())
    if not description:
        raise HTTPException(422, "Escribe una descripción.")
    transaction.transaction_type = payload.transaction_type
    transaction.amount_clp = (
        payload.amount_clp if payload.transaction_type == TransactionType.INCOME
        else -payload.amount_clp
    )
    transaction.date = payload.date
    transaction.description = description
    transaction.normalized_description = description.casefold()
    transaction.category_id = category_id
    transaction.category_source = CategorySource.MANUAL if category_id is not None else None
    transaction.rule_id_applied = None
    transaction.fingerprint = None
    transaction.raw_data = None


def create_manual_transaction(session: Session, payload: ManualTransactionInput) -> Transaction:
    account = get_cash_account(session)
    category_id = _validated_category(session, payload)
    transaction = TransactionModel(
        account_id=account.id, statement_id=None, origin=TransactionOrigin.MANUAL,
        date=payload.date, description="", normalized_description="",
        amount_clp=0, transaction_type=payload.transaction_type,
    )
    _apply_payload(transaction, payload, category_id)
    session.add(transaction)
    refresh_internal_transfer_matches(session)
    session.commit()
    session.refresh(transaction)
    return _to_transaction(transaction, _matched_transaction_ids(session))


def _editable_manual_transaction(session: Session, transaction_id: int) -> TransactionModel:
    transaction = session.get(TransactionModel, transaction_id)
    if transaction is None:
        raise HTTPException(404, "El movimiento no existe.")
    account = get_cash_account(session)
    if transaction.origin != TransactionOrigin.MANUAL or transaction.account_id != account.id:
        raise HTTPException(409, "Solo puedes modificar movimientos manuales de Efectivo.")
    return transaction


def update_manual_transaction(
    session: Session, transaction_id: int, payload: ManualTransactionInput,
) -> Transaction:
    transaction = _editable_manual_transaction(session, transaction_id)
    category_id = _validated_category(session, payload)
    _apply_payload(transaction, payload, category_id)
    transaction.updated_at = datetime.now(timezone.utc)
    session.add(transaction)
    refresh_internal_transfer_matches(session)
    session.commit()
    session.refresh(transaction)
    return _to_transaction(transaction, _matched_transaction_ids(session))


def delete_manual_transaction(session: Session, transaction_id: int) -> None:
    transaction = _editable_manual_transaction(session, transaction_id)
    session.delete(transaction)
    refresh_internal_transfer_matches(session)
    session.commit()
