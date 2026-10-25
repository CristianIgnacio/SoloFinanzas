"""Explicitly link an imported bank movement to its cash counterpart."""

from fastapi import HTTPException
from sqlalchemy import or_
from sqlmodel import Session, select

from app.domain.enums import AccountKind, CategoryType, TransactionOrigin, TransactionType
from app.models.account import AccountModel
from app.models.category import CategoryModel
from app.models.internal_transfer_match import InternalTransferMatchModel
from app.models.transaction import TransactionModel
from app.schemas.transaction import Transaction
from app.services.cash_transactions import get_cash_account
from app.services.catalogs import CASH_DEPOSIT_CATEGORY, CASH_WITHDRAWAL_CATEGORY
from app.services.internal_transfers import refresh_internal_transfer_matches
from app.services.transactions import get_transaction


def _match_for(session: Session, transaction_id: int) -> InternalTransferMatchModel | None:
    return session.exec(select(InternalTransferMatchModel).where(or_(
        InternalTransferMatchModel.outgoing_transaction_id == transaction_id,
        InternalTransferMatchModel.incoming_transaction_id == transaction_id,
    ))).first()


def link_imported_transaction_to_cash(session: Session, bank_transaction_id: int) -> Transaction:
    bank_transaction = session.get(TransactionModel, bank_transaction_id)
    if bank_transaction is None:
        raise HTTPException(404, "El movimiento no existe.")
    bank_account = session.get(AccountModel, bank_transaction.account_id)
    if (bank_transaction.origin != TransactionOrigin.PDF or bank_account is None
            or bank_account.account_kind != AccountKind.FINANCIAL):
        raise HTTPException(409, "Solo se puede vincular un movimiento bancario importado.")
    if bank_transaction.amount_clp == 0:
        raise HTTPException(409, "Un movimiento sin monto no se puede vincular.")
    category = session.get(CategoryModel, bank_transaction.category_id) if bank_transaction.category_id else None
    parent = session.get(CategoryModel, category.parent_id) if category and category.parent_id else None
    expected_name = (CASH_WITHDRAWAL_CATEGORY if bank_transaction.amount_clp < 0
                     else CASH_DEPOSIT_CATEGORY)
    if (category is None or not category.is_active or category.type != CategoryType.TRANSFER
            or category.name != expected_name or parent is None or not parent.is_active
            or parent.type != CategoryType.TRANSFER or parent.name != "Transferencias"):
        raise HTTPException(409, "Clasifica el movimiento como retiro o depósito de efectivo antes de vincularlo.")
    if _match_for(session, bank_transaction_id) is not None:
        raise HTTPException(409, "Este movimiento ya pertenece a una transferencia.")

    cash_account = get_cash_account(session)
    cash_amount = -bank_transaction.amount_clp
    cash_transaction = TransactionModel(
        account_id=cash_account.id,
        statement_id=None,
        origin=TransactionOrigin.CASH_TRANSFER,
        date=bank_transaction.date,
        description=(f"Retiro desde {bank_account.name}" if cash_amount > 0
                     else f"Depósito a {bank_account.name}"),
        normalized_description=(f"retiro desde {bank_account.name}" if cash_amount > 0
                                else f"depósito a {bank_account.name}").casefold(),
        amount_clp=cash_amount,
        transaction_type=TransactionType.INCOME if cash_amount > 0 else TransactionType.EXPENSE,
    )
    try:
        session.add(cash_transaction)
        session.flush()
        match = InternalTransferMatchModel(
            outgoing_transaction_id=(bank_transaction.id if bank_transaction.amount_clp < 0
                                     else cash_transaction.id),
            incoming_transaction_id=(cash_transaction.id if cash_amount > 0
                                     else bank_transaction.id),
            amount_clp=abs(cash_amount),
            date_gap_days=0,
            match_kind="cash",
        )
        session.add(match)
        refresh_internal_transfer_matches(session)
        session.commit()
    except Exception:
        session.rollback()
        raise
    return get_transaction(session, bank_transaction_id)


def unlink_cash_transaction(session: Session, transaction_id: int) -> Transaction:
    transaction = session.get(TransactionModel, transaction_id)
    if transaction is None:
        raise HTTPException(404, "El movimiento no existe.")
    match = _match_for(session, transaction_id)
    if match is None or match.match_kind != "cash":
        raise HTTPException(409, "Este movimiento no está vinculado con Efectivo.")
    outgoing = session.get(TransactionModel, match.outgoing_transaction_id)
    incoming = session.get(TransactionModel, match.incoming_transaction_id)
    cash_transaction = next(
        (row for row in (outgoing, incoming) if row.origin == TransactionOrigin.CASH_TRANSFER),
        None,
    )
    bank_transaction = next(
        (row for row in (outgoing, incoming) if row.origin == TransactionOrigin.PDF),
        None,
    )
    if cash_transaction is None or bank_transaction is None:
        raise HTTPException(409, "El vínculo con Efectivo está incompleto.")
    try:
        session.delete(match)
        session.flush()
        from app.services.category_feedback import delete_feedback_for_transactions
        delete_feedback_for_transactions(session, [cash_transaction.id])
        session.delete(cash_transaction)
        session.flush()
        refresh_internal_transfer_matches(session)
        session.commit()
    except Exception:
        session.rollback()
        raise
    return get_transaction(session, bank_transaction.id)
