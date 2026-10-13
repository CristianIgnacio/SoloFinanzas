from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.core.database import get_session
from app.domain.account_products import list_financial_products
from app.schemas.account import Account, AccountCreate, AccountUpdate, FinancialProductRead
from app.services.accounts import (
    AccountDeleteConflictError,
    AccountProductValidationError,
    create_account,
    delete_account,
    list_accounts,
    update_account,
)
from app.services.cash_transactions import get_cash_account
from app.services.cash_balance import (
    CashBalanceRead, CashOpeningBalanceInput, clear_cash_opening_balance,
    get_cash_balance, set_cash_opening_balance,
)

router = APIRouter()
SessionDep = Annotated[Session, Depends(get_session)]


@router.get("/account-products", response_model=list[FinancialProductRead])
def get_account_products(_session: SessionDep) -> list[FinancialProductRead]:
    """Expone el catálogo que usa el formulario de cuentas."""
    return [
        FinancialProductRead(
            code=product.code,
            institution=product.institution,
            name=product.name,
            kind=product.kind,
            pdf_support=product.pdf_support,
        )
        for product in list_financial_products()
    ]


@router.get("/accounts", response_model=list[Account])
def get_accounts(session: SessionDep) -> list[Account]:
    """Devuelve todas las cuentas registradas."""
    return list_accounts(session)


@router.get("/cash-account")
def get_cash_account_detail(session: SessionDep) -> dict[str, int | str]:
    """Return the current user's system cash account."""
    account = get_cash_account(session)
    return {"id": account.id, "name": account.name}


@router.get("/cash-account/balance", response_model=CashBalanceRead)
def get_cash_account_balance(session: SessionDep) -> CashBalanceRead:
    return get_cash_balance(session)


@router.put("/cash-account/balance", response_model=CashBalanceRead)
def put_cash_account_balance(payload: CashOpeningBalanceInput, session: SessionDep) -> CashBalanceRead:
    return set_cash_opening_balance(session, payload)


@router.delete("/cash-account/balance", response_model=CashBalanceRead)
def delete_cash_account_balance(session: SessionDep) -> CashBalanceRead:
    return clear_cash_opening_balance(session)


@router.post("/accounts", response_model=Account, status_code=status.HTTP_201_CREATED)
def post_account(payload: AccountCreate, session: SessionDep) -> Account:
    """Crea una cuenta bancaria o billetera."""
    try:
        return create_account(session, payload)
    except AccountProductValidationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.put("/accounts/{account_id}", response_model=Account)
def put_account(account_id: int, payload: AccountUpdate, session: SessionDep) -> Account:
    """Reemplaza los datos editables de una cuenta existente."""
    try:
        account = update_account(session, account_id, payload)
    except AccountProductValidationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
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
