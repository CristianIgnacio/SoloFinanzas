from collections import defaultdict
from datetime import date

from sqlmodel import Session, select
from sqlalchemy import String, cast, func, or_

from app.domain.enums import TransactionType
from app.models.internal_transfer_match import InternalTransferMatchModel
from app.models.transaction import TransactionModel
from app.schemas.dashboard import DashboardResponse, MonthlyMovement, SummaryCard


def _shift_month(month_key: str, offset: int) -> str:
    """Desplaza una clave YYYY-MM la cantidad indicada de meses."""
    year, month = (int(part) for part in month_key.split("-"))
    month_index = year * 12 + month - 1 + offset
    shifted_year, shifted_month = divmod(month_index, 12)
    return f"{shifted_year:04d}-{shifted_month + 1:02d}"


def build_dashboard_summary(
    session: Session,
    requested_period: str | None = None,
) -> DashboardResponse:
    """Construye el resumen del dashboard a partir de transacciones reales."""

    month = func.substr(cast(TransactionModel.date, String), 1, 7)
    available_periods = list(session.exec(select(month).select_from(TransactionModel)
        .distinct().order_by(month.desc())).all())
    current_month = date.today().strftime("%Y-%m")
    default_period = current_month if current_month in available_periods else (available_periods[0] if available_periods else current_month)
    period_month = requested_period if requested_period in available_periods else default_period
    matched = select(InternalTransferMatchModel.id).where(or_(
        InternalTransferMatchModel.outgoing_transaction_id == TransactionModel.id,
        InternalTransferMatchModel.incoming_transaction_id == TransactionModel.id,
    )).exists()
    rows = session.exec(select(month, TransactionModel.transaction_type, func.sum(TransactionModel.amount_clp))
        .where(~matched).group_by(month, TransactionModel.transaction_type)).all()
    monthly_data = defaultdict(lambda: {"income": 0, "expenses": 0})
    for month_key, kind, amount in rows:
        if kind == TransactionType.INCOME:
            monthly_data[month_key]["income"] = amount
        elif kind == TransactionType.EXPENSE:
            monthly_data[month_key]["expenses"] = abs(amount)
    month_income = monthly_data[period_month]["income"]
    month_expenses = -monthly_data[period_month]["expenses"]

    previous_month = _shift_month(period_month, -1)
    previous_income = monthly_data[previous_month]["income"]
    previous_expenses = monthly_data[previous_month]["expenses"]
    balance = month_income + month_expenses
    previous_balance = previous_income - previous_expenses

    def format_clp(amount: int) -> str:
        """Formatea un monto entero como peso chileno."""
        return f"${amount:,.0f}".replace(",", ".")

    def format_variation(current: int, previous: int) -> str:
        delta = current - previous
        if delta == 0:
            return "Sin variacion vs mes anterior"

        direction = "Subio" if delta > 0 else "Bajo"
        return f"{direction} {format_clp(abs(delta))} vs mes anterior"

    cards = [
        SummaryCard(
            label="Balance total",
            value=format_clp(balance),
            trend=format_variation(balance, previous_balance),
        ),
        SummaryCard(
            label="Ingresos del mes",
            value=format_clp(month_income),
            trend=format_variation(month_income, previous_income),
        ),
        SummaryCard(
            label="Gastos del mes",
            value=format_clp(month_expenses),
            trend=format_variation(abs(month_expenses), previous_expenses),
        ),
    ]

    visible_months = [_shift_month(period_month, offset) for offset in range(-11, 1)]
    monthly_movements = [
        MonthlyMovement(month=month, **monthly_data[month])
        for month in visible_months
    ]

    return DashboardResponse(
        period_month=period_month,
        available_periods=available_periods,
        cards=cards,
        monthly_movements=monthly_movements,
    )
