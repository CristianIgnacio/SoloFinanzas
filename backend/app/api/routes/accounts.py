from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.core.database import get_session
from app.schemas.account import Account, AccountCreate, AccountUpdate
from app.services.accounts import (
    AccountDeleteConflictError,
    create_account,
    delete_account,
    list_accounts,
    update_account,
)

router = APIRouter()
SessionDep = Annotated[Session, Depends(get_session)]


@router.get("/accounts", response_model=list[Account])
def get_accounts(session: SessionDep) -> list[Account]:
    """Devuelve todas las cuentas registradas."""
    return list_accounts(session)


@router.post("/accounts", response_model=Account, status_code=status.HTTP_201_CREATED)
def post_account(payload: AccountCreate, session: SessionDep) -> Account:
    """Crea una cuenta bancaria o billetera."""
    return create_account(session, payload)


@router.put("/accounts/{account_id}", response_model=Account)
def put_account(account_id: int, payload: AccountUpdate, session: SessionDep) -> Account:
    """Reemplaza los datos editables de una cuenta existente."""
    account = update_account(session, account_id, payload)
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    return account


@router.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account_endpoint(account_id: int, session: SessionDep) -> None:
    """Elimina una cuenta o informa conflicto si tiene datos asociados."""
    try:
        deleted = delete_account(session, account_id)
    except AccountDeleteConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error

    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
