from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.core.database import get_session
from app.schemas.transaction import (
    Transaction,
    TransactionCategoryUpdate,
    TransactionCreate,
)
from app.services.transactions import (
    create_transaction,
    create_bulk_transactions,
    get_transaction,
    list_transactions,
    update_transaction_category,
)

router = APIRouter()
SessionDep = Annotated[Session, Depends(get_session)]


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
    return create_transaction(session, payload)


@router.post("/transactions/bulk", response_model=list[Transaction], status_code=status.HTTP_201_CREATED)
def post_transactions_bulk(
    payloads: list[TransactionCreate], session: SessionDep
) -> list[Transaction]:
    """Crea varias transacciones en una sola llamada."""
    return create_bulk_transactions(session, payloads)


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
            payload.category_source.value if payload.category_source else None,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return transaction
