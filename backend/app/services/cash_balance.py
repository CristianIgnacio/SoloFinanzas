"""Opening balance and calculated cash balance for the current user's Efectivo."""

from datetime import date

from sqlalchemy import func
from sqlmodel import Field, SQLModel, Session, select

from app.models.transaction import TransactionModel
from app.services.cash_transactions import get_cash_account


class CashOpeningBalanceInput(SQLModel):
    amount_clp: int = Field(ge=0, le=2_147_483_647)
    date: date


class CashBalanceRead(SQLModel):
    opening_balance_clp: int | None
    opening_balance_date: date | None
    movements_clp: int
    balance_clp: int
    is_negative: bool


def get_cash_balance(session: Session) -> CashBalanceRead:
    account = get_cash_account(session)
    query = select(func.coalesce(func.sum(TransactionModel.amount_clp), 0)).where(
        TransactionModel.account_id == account.id,
    )
    if account.opening_balance_date is not None:
        query = query.where(TransactionModel.date >= account.opening_balance_date)
    movements = int(session.exec(query).one())
    balance = (account.opening_balance_clp or 0) + movements
    return CashBalanceRead(
        opening_balance_clp=account.opening_balance_clp,
        opening_balance_date=account.opening_balance_date,
        movements_clp=movements,
        balance_clp=balance,
        is_negative=balance < 0,
    )


def set_cash_opening_balance(session: Session, payload: CashOpeningBalanceInput) -> CashBalanceRead:
    account = get_cash_account(session)
    account.opening_balance_clp = payload.amount_clp
    account.opening_balance_date = payload.date
    session.add(account)
    session.commit()
    return get_cash_balance(session)


def clear_cash_opening_balance(session: Session) -> CashBalanceRead:
    account = get_cash_account(session)
    account.opening_balance_clp = None
    account.opening_balance_date = None
    session.add(account)
    session.commit()
    return get_cash_balance(session)
