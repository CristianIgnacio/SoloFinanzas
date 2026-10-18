from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.core.database import get_session
from app.schemas.transaction import (
    ManualTransactionInput,
    Transaction,
    TransactionCategoryUpdate,
    TransactionCreate,
)
from app.services.cash_transactions import (
    create_manual_transaction, update_manual_transaction, delete_manual_transaction,
)
from app.services.cash_links import link_imported_transaction_to_cash, unlink_cash_transaction
from app.services.transactions import (
    create_transaction,
    create_bulk_transactions,
    get_transaction,
    list_transactions,
    update_transaction_category,
)
from app.services.category_feedback import CategoryConflictError, undo_decision
from pydantic import BaseModel

router = APIRouter()
SessionDep = Annotated[Session, Depends(get_session)]


@router.post("/cash-transactions", response_model=Transaction, status_code=status.HTTP_201_CREATED)
def post_cash_transaction(payload: ManualTransactionInput, session: SessionDep) -> Transaction:
    return create_manual_transaction(session, payload)


@router.put("/cash-transactions/{transaction_id}", response_model=Transaction)
def put_cash_transaction(
    transaction_id: int, payload: ManualTransactionInput, session: SessionDep,
) -> Transaction:
    return update_manual_transaction(session, transaction_id, payload)


@router.delete("/cash-transactions/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cash_transaction(transaction_id: int, session: SessionDep) -> None:
    delete_manual_transaction(session, transaction_id)


@router.post("/transactions/{transaction_id}/cash-link", response_model=Transaction)
def post_cash_link(transaction_id: int, session: SessionDep) -> Transaction:
    return link_imported_transaction_to_cash(session, transaction_id)


@router.delete("/transactions/{transaction_id}/cash-link", response_model=Transaction)
def delete_cash_link(transaction_id: int, session: SessionDep) -> Transaction:
    return unlink_cash_transaction(session, transaction_id)


@router.get("/transactions", response_model=list[Transaction])
def get_transactions(
    session: SessionDep,
    account_id: int | None = Query(None),
    statement_id: int | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    transaction_type: str | None = Query(None),
    category_id: int | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> list[Transaction]:
    """Devuelve transacciones con filtros y paginacion opcionales."""
    return list_transactions(
        session,
        account_id=account_id,
        statement_id=statement_id,
        date_from=date_from,
        date_to=date_to,
        transaction_type=transaction_type,
        category_id=category_id,
        limit=limit,
        offset=offset,
    )


@router.get("/transaction-pages")
def get_transaction_page(session: SessionDep, account_id: int | None = None,
    statement_id: int | None = None, date_from: date | None = None, date_to: date | None = None,
    transaction_type: str | None = None, category_id: int | None = None,
    uncategorized: bool = False, exclude_internal: bool = False,
    limit: int = Query(50, ge=1, le=1000), offset: int = Query(0, ge=0)):
    from app.services.transactions import transaction_page
    return transaction_page(session, account_id=account_id, statement_id=statement_id,
        date_from=date_from, date_to=date_to, transaction_type=transaction_type,
        category_id=category_id, uncategorized=uncategorized, exclude_internal=exclude_internal,
        limit=limit, offset=offset)


@router.get("/transactions/{transaction_id}", response_model=Transaction)
def get_transaction_detail(transaction_id: int, session: SessionDep) -> Transaction:
    """Devuelve una transaccion especifica."""
    transaction = get_transaction(session, transaction_id)
    if not transaction:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Transaction not found")
    return transaction


@router.post("/transactions", response_model=Transaction, status_code=status.HTTP_201_CREATED)
def post_transaction(payload: TransactionCreate, session: SessionDep) -> Transaction:
    """Crea una transaccion manual."""
    try:
        return create_transaction(session, payload)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/transactions/bulk", response_model=list[Transaction], status_code=status.HTTP_201_CREATED)
def post_transactions_bulk(
    payloads: list[TransactionCreate], session: SessionDep
) -> list[Transaction]:
    """Crea varias transacciones en una sola llamada."""
    try:
        return create_bulk_transactions(session, payloads)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.patch("/transactions/{transaction_id}/category")
def patch_transaction_category(
    transaction_id: int,
    payload: TransactionCategoryUpdate,
    session: SessionDep,
) -> Transaction:
    """Actualiza la categoria asociada a una transaccion."""
    try:
        transaction = update_transaction_category(
            session,
            transaction_id,
            payload.category_id,
            action=payload.action,
            remember=payload.remember,
            pattern=payload.pattern,
            match_type=payload.match_type,
            expected_version=payload.expected_version,
        )
    except CategoryConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return transaction


class CategoryUndo(BaseModel):
    event_id: int
    expected_version: int


@router.post("/transactions/{transaction_id}/category/undo", response_model=Transaction)
def post_category_undo(transaction_id: int, payload: CategoryUndo, session: SessionDep) -> Transaction:
    try:
        undo_decision(session, transaction_id, payload.event_id, payload.expected_version)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    transaction = get_transaction(session, transaction_id)
    if transaction is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return transaction
