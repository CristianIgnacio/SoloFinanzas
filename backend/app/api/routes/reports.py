from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import String, case, cast, func
from sqlmodel import select

from app.core.database import get_session
from app.core.tenancy import TenantSession
from app.models import TransactionModel as T

router = APIRouter()
SessionDep = Annotated[TenantSession, Depends(get_session)]


@router.get('/reports/accounts')
def account_totals(session: SessionDep):
    rows = session.exec(select(T.account_id, func.count(T.id), func.sum(T.amount_clp),
        func.sum(case((T.amount_clp > 0, T.amount_clp), else_=0)),
        func.sum(case((T.amount_clp < 0, -T.amount_clp), else_=0))).group_by(T.account_id)).all()
    return [dict(account_id=a, count=n, net=net, income=income, expenses=expenses)
            for a, n, net, income, expenses in rows]


@router.get('/reports/periods')
def periods(session: SessionDep, statement_id: int | None = None):
    month = func.substr(cast(T.date, String), 1, 7)
    query = select(month).select_from(T).distinct().order_by(month.desc())
    if statement_id is not None:
        query = query.where(T.statement_id == statement_id)
    return session.exec(query).all()
