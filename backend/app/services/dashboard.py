from collections import defaultdict
from datetime import date

from sqlmodel import Session, select

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

    query = select(TransactionModel).order_by(TransactionModel.date.desc())
    transactions = session.exec(query).all()
    internal_transfer_matches = session.exec(select(InternalTransferMatchModel)).all()
    excluded_transaction_ids = {
        transaction_id
        for match in internal_transfer_matches
        for transaction_id in (
            match.outgoing_transaction_id,
            match.incoming_transaction_id,
        )
    }

    available_periods = sorted(
        {tx.date.strftime("%Y-%m") for tx in transactions},
        reverse=True,
    )
    current_month = date.today().strftime("%Y-%m")
    default_period = (
        current_month
        if current_month in available_periods
        else available_periods[0] if available_periods else current_month
    )
    period_month = (
        requested_period
        if requested_period in available_periods
        else default_period
    )

    month_income = 0
    month_expenses = 0
    monthly_data = defaultdict(lambda: {"income": 0, "expenses": 0})

    for tx in transactions:
        if tx.id in excluded_transaction_ids:
            continue

        tx_month = tx.date.strftime("%Y-%m")
        if tx_month == period_month:
            if tx.transaction_type == TransactionType.INCOME:
                month_income += tx.amount_clp
            elif tx.transaction_type == TransactionType.EXPENSE:
                month_expenses += tx.amount_clp

        month_key = tx.date.strftime("%Y-%m")
        if tx.transaction_type == TransactionType.INCOME:
            monthly_data[month_key]["income"] += tx.amount_clp
        elif tx.transaction_type == TransactionType.EXPENSE:
            monthly_data[month_key]["expenses"] += abs(tx.amount_clp)

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
