from datetime import date

from sqlmodel import Session, select
from sqlalchemy import func, or_

from app.domain.enums import CategorySource, CategoryType, TransactionOrigin, TransactionType
from app.models.category import CategoryModel
from app.models.internal_transfer_match import InternalTransferMatchModel
from app.models.transaction import TransactionModel
from app.schemas.transaction import Transaction, TransactionCreate
from app.services.internal_transfers import refresh_internal_transfer_matches


def _matched_transaction_ids(session: Session) -> set[int]:
    matches = session.exec(select(InternalTransferMatchModel)).all()
    return {
        transaction_id
        for match in matches
        for transaction_id in (
            match.outgoing_transaction_id,
            match.incoming_transaction_id,
        )
    }


def _cash_linked_transaction_ids(session: Session) -> set[int]:
    matches = session.exec(select(InternalTransferMatchModel).where(
        InternalTransferMatchModel.match_kind == "cash",
    )).all()
    return {
        transaction_id
        for match in matches
        for transaction_id in (match.outgoing_transaction_id, match.incoming_transaction_id)
    }


def _to_transaction(
    transaction: TransactionModel,
    matched_ids: set[int],
    cash_linked_ids: set[int] | None = None,
    evidence=None,
) -> Transaction:
    from app.services.category_feedback import memory_suggestion
    memory = memory_suggestion(None, transaction.normalized_description,
                               transaction.transaction_type, evidence) if evidence is not None else None
    return Transaction.model_validate(transaction).model_copy(
        update={
            "is_internal_transfer": transaction.id in matched_ids,
            "cash_transfer_linked": transaction.id in (cash_linked_ids or set()),
            "personalized_category_id": memory.get("category_id") if memory else None,
            "suggestion_reason": memory.get("reason") if memory else None,
            "suggestion_conflict": bool(memory and memory.get("conflict")),
        }
    )


def create_transaction(session: Session, payload: TransactionCreate) -> Transaction:
    """Crea una transaccion individual desde el payload validado."""
    _validate_import_category(session, payload.category_id, payload.transaction_type)
    transaction = TransactionModel(
        account_id=payload.account_id,
        statement_id=payload.statement_id,
        source_row=payload.source_row,
        date=payload.date,
        description=payload.description,
        normalized_description=payload.normalized_description,
        amount_clp=payload.amount_clp,
        transaction_type=payload.transaction_type,
        category_id=payload.category_id,
        category_source=CategorySource.MANUAL if payload.category_id is not None else None,
        rule_id_applied=None,
        fingerprint=payload.fingerprint,
        raw_data=payload.raw_data,
    )
    session.add(transaction)
    refresh_internal_transfer_matches(session)
    session.commit()
    session.refresh(transaction)
    from app.services.category_feedback import _effective_evidence
    return _to_transaction(transaction, _matched_transaction_ids(session), _cash_linked_transaction_ids(session), list(_effective_evidence(session)))


def create_bulk_transactions(
    session: Session, transactions: list[TransactionCreate]
) -> list[Transaction]:
    """Crea multiples transacciones en una sola operacion de sesion."""
    for item in transactions:
        _validate_import_category(session, item.category_id, item.transaction_type)
    models = [
        TransactionModel(**{
            **item.model_dump(),
            "category_source": CategorySource.MANUAL if item.category_id is not None else None,
            "rule_id_applied": None,
        })
        for item in transactions
    ]
    session.add_all(models)
    refresh_internal_transfer_matches(session)
    session.commit()
    for model in models:
        session.refresh(model)
    matched_ids = _matched_transaction_ids(session)
    cash_linked_ids = _cash_linked_transaction_ids(session)
    from app.services.category_feedback import _effective_evidence
    evidence = list(_effective_evidence(session))
    return [_to_transaction(t, matched_ids, cash_linked_ids, evidence) for t in models]


def _validate_import_category(session: Session, category_id: int | None, transaction_type: TransactionType) -> None:
    if category_id is None:
        return
    category = session.get(CategoryModel, category_id)
    expected = CategoryType.INCOME if transaction_type == TransactionType.INCOME else CategoryType.EXPENSE
    if category is None or not category.is_active or category.type not in (expected, CategoryType.TRANSFER):
        raise ValueError("La categoría seleccionada no es compatible con el movimiento.")


def list_transactions(
    session: Session,
    account_id: int | None = None,
    statement_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    transaction_type: str | None = None,
    category_id: int | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[Transaction]:
    """Lista transacciones aplicando filtros y paginacion opcionales."""
    query = transaction_query(session, account_id, statement_id, date_from, date_to, transaction_type, category_id)
    query = query.order_by(TransactionModel.date.desc(), TransactionModel.id.desc())
    transactions = session.exec(query.limit(limit).offset(offset)).all()
    matched_ids = _matched_transaction_ids(session)
    cash_linked_ids = _cash_linked_transaction_ids(session)
    from app.services.category_feedback import _effective_evidence
    evidence = list(_effective_evidence(session))
    return [_to_transaction(t, matched_ids, cash_linked_ids, evidence) for t in transactions]


def get_transaction(session: Session, transaction_id: int) -> Transaction | None:
    """Obtiene una transaccion por ID."""
    transaction = session.exec(
        select(TransactionModel).where(TransactionModel.id == transaction_id)
    ).first()
    if not transaction:
        return None
    from app.services.category_feedback import _effective_evidence
    return _to_transaction(transaction, _matched_transaction_ids(session), _cash_linked_transaction_ids(session), list(_effective_evidence(session)))


def update_transaction_category(
    session: Session,
    transaction_id: int,
    category_id: int | None,
    category_source: str | None = None,
    *,
    action: str = "set",
    remember: bool = False,
    pattern: str | None = None,
    match_type: str = "exact",
    expected_version: int | None = None,
) -> Transaction | None:
    """Actualiza la categoria manual o automatica de una transaccion."""
    transaction = session.exec(
        select(TransactionModel).where(TransactionModel.id == transaction_id)
    ).first()
    if transaction:
        if expected_version is not None and transaction.category_version != expected_version:
            from app.services.category_feedback import CategoryConflictError
            raise CategoryConflictError("La categoría cambió desde que abriste este movimiento.")
        if action not in ("set", "confirm"):
            raise ValueError("La acción de categorización no es válida.")
        if action == "confirm" and transaction.category_id != category_id:
            raise ValueError("La confirmación debe conservar la categoría actual.")
        if transaction.origin == TransactionOrigin.CASH_TRANSFER:
            raise ValueError("Deshaz el vínculo para modificar una contraparte de Efectivo.")
        if category_id is not None:
            category = session.get(CategoryModel, category_id)
            if category is None:
                raise ValueError("La categoria seleccionada no existe.")
            if not category.is_active:
                raise ValueError("La categoria seleccionada esta archivada.")

            direction_type = (
                CategoryType.INCOME
                if transaction.transaction_type == TransactionType.INCOME
                else CategoryType.EXPENSE
            )
            allowed_types = {direction_type}
            if transaction.origin != TransactionOrigin.MANUAL:
                allowed_types.add(CategoryType.TRANSFER)
            if category.type not in allowed_types:
                raise ValueError(
                    "La categoria debe coincidir con la direccion del movimiento "
                    "o ser una transferencia."
                )

        # Older service callers used an explicit manual source to confirm the
        # current category. Preserve that intent without treating ordinary saves
        # from the current API as confirmations.
        if action == "set" and transaction.category_id == category_id and category_source == "manual":
            action = "confirm"
        if action == "set" and transaction.category_id == category_id:
            return get_transaction(session, transaction_id)
        from app.services.category_feedback import record_decision
        event = record_decision(session, transaction, category_id, remember=remember,
                                pattern=pattern, match_type=match_type, decision_kind=action)
        refresh_internal_transfer_matches(session)
        session.commit()
        session.refresh(transaction)
        from app.services.category_feedback import _effective_evidence
        return _to_transaction(transaction, _matched_transaction_ids(session), _cash_linked_transaction_ids(session), list(_effective_evidence(session))).model_copy(
            update={"category_event_id": event.id})
    return None


def count_transactions(
    session: Session,
    account_id: int | None = None,
    statement_id: int | None = None,
) -> int:
    """Cuenta transacciones aplicando filtros opcionales de cuenta o cartola."""
    query = select(TransactionModel)
    if account_id is not None:
        query = query.where(TransactionModel.account_id == account_id)
    if statement_id is not None:
        query = query.where(TransactionModel.statement_id == statement_id)

    return session.exec(query).all().__len__()


def transaction_query(session, account_id=None, statement_id=None, date_from=None, date_to=None,
                      transaction_type=None, category_id=None, uncategorized=False, exclude_internal=False):
    query = select(TransactionModel)

    if account_id is not None:
        query = query.where(TransactionModel.account_id == account_id)
    if statement_id is not None:
        query = query.where(TransactionModel.statement_id == statement_id)
    if date_from is not None:
        query = query.where(TransactionModel.date >= date_from)
    if date_to is not None:
        query = query.where(TransactionModel.date <= date_to)
    if transaction_type is not None:
        query = query.where(TransactionModel.transaction_type == transaction_type)
    if category_id is not None:
        child_ids = session.exec(
            select(CategoryModel.id).where(CategoryModel.parent_id == category_id)
        ).all()
        query = query.where(
            TransactionModel.category_id.in_([category_id, *child_ids])
        )

    if uncategorized:
        query = query.where(TransactionModel.category_id.is_(None))
    if exclude_internal:
        matched = select(InternalTransferMatchModel.id).where(or_(
            InternalTransferMatchModel.outgoing_transaction_id == TransactionModel.id,
            InternalTransferMatchModel.incoming_transaction_id == TransactionModel.id)).exists()
        query = query.where(~matched)
    return query


def transaction_page(session, limit=50, offset=0, **filters):
    query = transaction_query(session, **filters)
    total = session.exec(query.with_only_columns(func.count(TransactionModel.id))).one()
    rows = session.exec(query.order_by(TransactionModel.date.desc(), TransactionModel.id.desc()).limit(limit).offset(offset)).all()
    matched = _matched_transaction_ids(session)
    cash_linked = _cash_linked_transaction_ids(session)
    from app.services.category_feedback import _effective_evidence
    evidence = list(_effective_evidence(session))
    return dict(items=[_to_transaction(row, matched, cash_linked, evidence) for row in rows], total=total, limit=limit, offset=offset)
