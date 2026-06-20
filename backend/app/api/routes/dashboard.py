from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.core.database import get_session
from app.schemas.dashboard import DashboardResponse
from app.services.dashboard import build_dashboard_summary

router = APIRouter()
SessionDep = Annotated[Session, Depends(get_session)]


@router.get("/dashboard", response_model=DashboardResponse)
def get_dashboard(
    session: SessionDep,
    period_month: str | None = Query(None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
) -> DashboardResponse:
    """Devuelve el resumen financiero del periodo solicitado."""
    return build_dashboard_summary(session, requested_period=period_month)
