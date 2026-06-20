from sqlmodel import Field, SQLModel


class SummaryCard(SQLModel):
    label: str
    value: str
    trend: str


class MonthlyMovement(SQLModel):
    month: str
    income: int
    expenses: int


class DashboardResponse(SQLModel):
    period_month: str
    available_periods: list[str]
    cards: list[SummaryCard]
    monthly_movements: list[MonthlyMovement]
