"""Explicit, reversible evidence for personalized category suggestions."""
from collections import defaultdict
from datetime import datetime, timezone
from uuid import uuid4

from sqlmodel import Session, select
from sqlalchemy.orm.exc import StaleDataError

from app.domain.enums import CategorySource, CategoryType, TransactionOrigin, TransactionType
from app.domain.normalizer import normalize_description
from app.models import CategoryFeedbackModel, CategoryModel, TransactionModel, CategorizationRuleModel, CategoryPatternModel
from app.services.internal_transfers import refresh_internal_transfer_matches


class CategoryConflictError(ValueError):
    """The decision was based on an outdated transaction version."""


def _pattern(value: str) -> str:
    normalized = normalize_description(value)
    if len(normalized) < 3:
        raise ValueError("El patrón debe tener al menos tres caracteres.")
    return normalized


def record_decision(
    session: Session, transaction: TransactionModel, category_id: int | None,
    *, remember: bool = False, pattern: str | None = None,
    match_type: str = "exact", decision_kind: str = "set", decision_group: str | None = None,
) -> CategoryFeedbackModel:
    if match_type not in ("exact", "contains"):
        raise ValueError("El tipo de coincidencia no es válido.")
    if remember and category_id is None:
        raise ValueError("Selecciona una categoría para recordar.")
    description = normalize_description(transaction.description)
    # Legacy clients can still request an explicit contains pattern. New clients
    # only choose a category; exact evidence is captured automatically.
    normalized_pattern = _pattern(pattern or description) if remember else description
    if not remember:
        match_type = "exact"
    if remember and match_type == "exact" and normalized_pattern != normalize_description(transaction.normalized_description):
        raise ValueError("La coincidencia exacta debe usar la descripción del movimiento.")
    if remember and match_type == "contains" and (
        f" {normalized_pattern} " not in f" {normalize_description(transaction.normalized_description)} "
    ):
        raise ValueError("El patrón debe aparecer en la descripción del movimiento.")
    previous = session.exec(select(CategoryFeedbackModel).where(
        CategoryFeedbackModel.transaction_id == transaction.id,
        CategoryFeedbackModel.is_active.is_(True),
    ).order_by(CategoryFeedbackModel.id.desc())).first()
    if previous:
        previous.is_active = False
        session.add(previous)
    event = CategoryFeedbackModel(
        transaction_id=transaction.id,
        previous_feedback_id=previous.id if previous else None,
        previous_category_id=transaction.category_id,
        previous_category_source=getattr(transaction.category_source, "value", transaction.category_source),
        previous_rule_id=transaction.rule_id_applied,
        previous_reviewed=transaction.category_reviewed,
        category_id=category_id,
        pattern=normalized_pattern,
        match_type=match_type,
        remembered=category_id is not None and len(normalized_pattern) >= 3,
        version=transaction.category_version + 1,
        decision_kind=decision_kind,
        description_snapshot=description,
        direction_snapshot=transaction.transaction_type.value,
        decision_group=decision_group or str(uuid4()),
    )
    transaction.category_id = category_id
    transaction.category_source = CategorySource.MANUAL if category_id is not None else None
    transaction.rule_id_applied = None
    transaction.category_reviewed = True
    transaction.category_version += 1
    transaction.updated_at = datetime.now(timezone.utc)
    session.add(transaction)
    session.add(event)
    try:
        session.flush()
        from app.services.category_patterns import sync_patterns
        sync_patterns(session)
    except StaleDataError as error:
        session.rollback()
        raise CategoryConflictError("La categoría cambió desde la última acción. Actualiza la lista.") from error
    return event


def latest_event(session: Session, transaction_id: int) -> CategoryFeedbackModel | None:
    return session.exec(select(CategoryFeedbackModel).where(
        CategoryFeedbackModel.transaction_id == transaction_id,
        CategoryFeedbackModel.is_active.is_(True),
    ).order_by(CategoryFeedbackModel.id.desc())).first()


def undo_decision(session: Session, transaction_id: int, event_id: int, expected_version: int) -> None:
    transaction = session.get(TransactionModel, transaction_id)
    event = latest_event(session, transaction_id)
    if transaction is None or event is None or event.id != event_id or transaction.category_version != expected_version:
        raise CategoryConflictError("La categoría cambió desde la última acción. Actualiza la lista e inténtalo de nuevo.")
    if transaction.origin == TransactionOrigin.CASH_TRANSFER:
        raise ValueError("Deshaz el vínculo con Efectivo antes de cambiar la categoría.")
    if event.previous_category_id is not None:
        previous_category = session.get(CategoryModel, event.previous_category_id)
        expected_type = CategoryType.INCOME if transaction.transaction_type == TransactionType.INCOME else CategoryType.EXPENSE
        if previous_category is None or previous_category.type not in (expected_type, CategoryType.TRANSFER):
            raise CategoryConflictError("La categoría anterior ya no es compatible con este movimiento.")
    previous_rule = session.get(CategorizationRuleModel, event.previous_rule_id) if event.previous_rule_id else None
    previous = session.get(CategoryFeedbackModel, event.previous_feedback_id) if event.previous_feedback_id else None
    transaction.category_id = event.previous_category_id
    transaction.category_source = CategorySource(event.previous_category_source) if event.previous_category_source else None
    # Keep the historical source even when the original rule has been deleted.
    transaction.rule_id_applied = previous_rule.id if previous_rule else None
    transaction.category_reviewed = event.previous_reviewed
    transaction.category_version += 1
    transaction.updated_at = datetime.now(timezone.utc)
    event.is_active = False
    session.add(event)
    if previous is not None:
        previous.is_active = True
        previous.version = transaction.category_version
        session.add(previous)
    session.add(transaction)
    try:
        refresh_internal_transfer_matches(session)
        from app.services.category_patterns import sync_patterns
        sync_patterns(session)
        session.commit()
    except StaleDataError as error:
        session.rollback()
        raise CategoryConflictError("La categoría cambió desde la última acción. Actualiza la lista.") from error


def _effective_evidence(session: Session):
    blocked = session.exec(select(CategoryPatternModel).where(
        CategoryPatternModel.learning_blocked.is_(True))).all()
    rows = session.exec(
        select(CategoryFeedbackModel, TransactionModel, CategoryModel)
        .join(TransactionModel, TransactionModel.id == CategoryFeedbackModel.transaction_id)
        .join(CategoryModel, CategoryModel.id == CategoryFeedbackModel.category_id)
        .where(
        CategoryFeedbackModel.is_active.is_(True),
        CategoryFeedbackModel.remembered.is_(True),
        CategoryModel.is_active.is_(True),
        TransactionModel.category_reviewed.is_(True),
        TransactionModel.category_id == CategoryFeedbackModel.category_id,
    )).all()
    for event, transaction, category in rows:
        if not transaction or not category:
            continue
        if transaction.origin == TransactionOrigin.CASH_TRANSFER:
            continue
        description = normalize_description(transaction.description)
        if event.direction_snapshot and event.direction_snapshot != transaction.transaction_type.value:
            continue
        if event.description_snapshot and event.description_snapshot != description:
            continue
        if any(item.transaction_type == transaction.transaction_type.value and (
            item.pattern == description if item.match_type == "exact"
            else f" {item.pattern} " in f" {description} "
        ) for item in blocked):
            continue
        if category.type not in (
            CategoryType.TRANSFER,
            CategoryType.INCOME if transaction.transaction_type == TransactionType.INCOME else CategoryType.EXPENSE,
        ):
            continue
        yield event, transaction


def memory_suggestion(session: Session | None, description: str, transaction_type: TransactionType,
                      evidence=None):
    normalized = normalize_description(description)
    votes: dict[tuple[int, int, str], set[int]] = defaultdict(set)
    if evidence is None and session is None:
        raise ValueError("Se requiere una sesión o evidencia precargada.")
    for event, transaction in (evidence if evidence is not None else _effective_evidence(session)):
        if transaction.transaction_type != transaction_type or not event.pattern:
            continue
        exact = event.match_type == "exact" and event.pattern == normalized
        contains = event.match_type == "contains" and f" {event.pattern} " in f" {normalized} "
        if exact or contains:
            votes[(0 if exact else 1, event.category_id, event.pattern)].add(transaction.id)
    if not votes:
        return None
    rank = min(key[0] for key in votes)
    eligible = {key: ids for key, ids in votes.items() if key[0] == rank}
    category_ids = {key[1] for key in eligible}
    if len(category_ids) != 1:
        return {"conflict": True, "reason": "Tus decisiones anteriores tienen categorías diferentes"}
    category_id = next(iter(category_ids))
    supporting = set().union(*eligible.values())
    return {"conflict": False, "category_id": category_id,
            "count": len(supporting), "reason": "Coincide con tus decisiones anteriores"}


def rule_proposals(session: Session) -> list[dict]:
    from app.services.category_patterns import list_patterns
    return [item for item in list_patterns(session) if item["state"] == "pending"]


def memory_patterns(session: Session) -> list[dict]:
    votes: dict[tuple[str, str, TransactionType, int], set[int]] = defaultdict(set)
    for event, transaction in _effective_evidence(session):
        if event.pattern:
            votes[(event.pattern, event.match_type, transaction.transaction_type, event.category_id)].add(transaction.id)
    return [
        dict(pattern=pattern, match_type=match_type, transaction_type=direction.value,
             category_id=category_id, evidence_count=len(ids))
        for (pattern, match_type, direction, category_id), ids in votes.items()
    ]


def forget_pattern(session: Session, pattern: str, transaction_type: TransactionType) -> int:
    normalized = _pattern(pattern)
    transaction_ids = set()
    for event in session.exec(select(CategoryFeedbackModel).where(
        CategoryFeedbackModel.pattern == normalized,
        CategoryFeedbackModel.remembered.is_(True),
    )).all():
        transaction = session.get(TransactionModel, event.transaction_id)
        if transaction and transaction.transaction_type == transaction_type:
            event.remembered = False
            session.add(event)
            transaction_ids.add(transaction.id)
    from app.services.category_patterns import ensure_pattern, transition, sync_patterns
    for match_type in ("exact", "contains"):
        item = ensure_pattern(session, normalized, match_type, transaction_type.value)
        item.learning_blocked = True
        transition(item, "rejected", "Patrón olvidado; aprendizaje detenido.")
        session.add(item)
    sync_patterns(session)
    session.commit()
    return len(transaction_ids)


def delete_feedback_for_transactions(session: Session, transaction_ids: list[int]) -> None:
    if transaction_ids:
        for event in session.exec(select(CategoryFeedbackModel).where(
            CategoryFeedbackModel.transaction_id.in_(transaction_ids)
        )).all():
            session.delete(event)
        session.flush()


def invalidate_feedback(session: Session, transaction: TransactionModel) -> None:
    event = latest_event(session, transaction.id)
    if event:
        event.is_active = False
        session.add(event)
    transaction.category_reviewed = False
    transaction.category_version += 1
    session.add(transaction)
