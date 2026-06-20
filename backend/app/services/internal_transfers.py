from __future__ import annotations

from collections import defaultdict
from datetime import timedelta

from sqlmodel import Session, select

from app.domain.enums import CategoryType, TransactionType
from app.models.category import CategoryModel
from app.models.internal_transfer_match import InternalTransferMatchModel
from app.models.transaction import TransactionModel
from app.services.chilean_business_calendar import is_chilean_bank_business_day


MAX_TRANSFER_DATE_GAP_DAYS = 5


def refresh_internal_transfer_matches(
    session: Session,
) -> list[InternalTransferMatchModel]:
    """Reconstruye los pares persistidos de transferencias internas."""
    session.flush()

    for match in session.exec(select(InternalTransferMatchModel)).all():
        session.delete(match)
    session.flush()

    transfer_category_ids = set(
        session.exec(
            select(CategoryModel.id).where(CategoryModel.type == CategoryType.TRANSFER)
        ).all()
    )
    transactions = session.exec(
        select(TransactionModel).order_by(
            TransactionModel.date.asc(),
            TransactionModel.id.asc(),
        )
    ).all()

    matches = _find_internal_transfer_matches(transactions, transfer_category_ids)
    session.add_all(matches)
    session.flush()
    return matches


def _find_internal_transfer_matches(
    transactions: list[TransactionModel],
    transfer_category_ids: set[int],
) -> list[InternalTransferMatchModel]:
    """Detecta pares uno-a-uno entre egresos y abonos de cuentas distintas."""
    incomes_by_amount: dict[int, list[TransactionModel]] = defaultdict(list)
    expenses_by_amount: dict[int, list[TransactionModel]] = defaultdict(list)

    for transaction in transactions:
        if transaction.id is None:
            continue

        amount = abs(transaction.amount_clp)
        if transaction.transaction_type == TransactionType.INCOME:
            incomes_by_amount[amount].append(transaction)
        elif transaction.transaction_type == TransactionType.EXPENSE:
            expenses_by_amount[amount].append(transaction)

    matches: list[InternalTransferMatchModel] = []
    used_income_ids: set[int] = set()

    for amount in sorted(expenses_by_amount):
        expenses = sorted(
            expenses_by_amount[amount],
            key=lambda transaction: (transaction.date, transaction.id or 0),
        )
        incomes = sorted(
            incomes_by_amount.get(amount, []),
            key=lambda transaction: (transaction.date, transaction.id or 0),
        )

        for expense in expenses:
            candidate = _select_income_candidate(
                expense,
                incomes,
                used_income_ids,
                transfer_category_ids,
            )
            if candidate is None or candidate.id is None or expense.id is None:
                continue

            used_income_ids.add(candidate.id)
            matches.append(
                InternalTransferMatchModel(
                    outgoing_transaction_id=expense.id,
                    incoming_transaction_id=candidate.id,
                    amount_clp=amount,
                    date_gap_days=abs((candidate.date - expense.date).days),
                )
            )

    return matches


def _select_income_candidate(
    expense: TransactionModel,
    incomes: list[TransactionModel],
    used_income_ids: set[int],
    transfer_category_ids: set[int],
) -> TransactionModel | None:
    candidates = [
        income
        for income in incomes
        if income.id is not None
        and income.id not in used_income_ids
        and income.account_id != expense.account_id
        and _dates_are_within_transfer_window(expense, income)
        and _is_transfer_category(expense, transfer_category_ids)
        and _is_transfer_category(income, transfer_category_ids)
    ]
    if not candidates:
        return None

    return min(
        candidates,
        key=lambda income: (
            abs((income.date - expense.date).days),
            income.date,
            income.id or 0,
        ),
    )


def _dates_are_within_transfer_window(
    expense: TransactionModel,
    income: TransactionModel,
) -> bool:
    """Acepta fechas consecutivas sin dias habiles bancarios intermedios."""
    date_gap = abs((income.date - expense.date).days)
    if date_gap <= 1:
        return True
    if date_gap > MAX_TRANSFER_DATE_GAP_DAYS:
        return False

    earlier_date = min(expense.date, income.date)
    later_date = max(expense.date, income.date)
    current_date = earlier_date + timedelta(days=1)
    while current_date < later_date:
        if is_chilean_bank_business_day(current_date):
            return False
        current_date += timedelta(days=1)
    return True


def _is_transfer_category(
    transaction: TransactionModel,
    transfer_category_ids: set[int],
) -> bool:
    return (
        transaction.category_id is not None
        and transaction.category_id in transfer_category_ids
    )
