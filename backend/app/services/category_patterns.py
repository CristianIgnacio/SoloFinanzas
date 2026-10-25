"""Rebuildable evidence, persistent user choices, and atomic rule acceptance."""
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError
from sqlmodel import Session, select

from app.domain.normalizer import normalize_description
from app.models import CategoryPatternModel, CategorizationRuleModel, CategoryModel, TransactionModel
from app.schemas.categorization_rule import CategorizationRule
from app.services.category_feedback import CategoryConflictError, _effective_evidence


GENERIC_DESCRIPTIONS = {
    "compra", "compras", "pago", "pago tarjeta", "transferencia", "transferencias",
    "transferencia recibida", "transferencia enviada", "abono", "cargo", "deposito",
    "depósito", "mercado pago", "mercadopago", "paypal", "compra nacional",
    "compra internacional", "pago comercio", "compra con tarjeta",
}


def matches(pattern: str, match_type: str, description: str) -> bool:
    return pattern == description if match_type == "exact" else f" {pattern} " in f" {description} "


def signature(pattern: str, match_type: str, direction: str) -> str:
    return sha256(json.dumps([pattern, match_type, direction], ensure_ascii=False).encode()).hexdigest()


def ensure_pattern(session: Session, pattern: str, match_type: str, direction: str) -> CategoryPatternModel:
    key = signature(pattern, match_type, direction)
    item = session.exec(select(CategoryPatternModel).where(CategoryPatternModel.signature == key)).first()
    if item is None:
        item = CategoryPatternModel(signature=key, pattern=pattern, match_type=match_type,
                                    transaction_type=direction)
        # A second request can discover the same pattern concurrently. The unique
        # owner/signature key is authoritative; don't duplicate its lifecycle.
        try:
            with session.begin_nested():
                session.add(item)
                session.flush()
        except IntegrityError:
            item = session.exec(select(CategoryPatternModel).where(CategoryPatternModel.signature == key)).one()
    return item


def transition(item: CategoryPatternModel, state: str, reason: str, *, force: bool = False) -> None:
    if item.state == state and item.reason == reason and not force:
        return
    item.state = state
    item.reason = reason
    item.version += 1
    item.updated_at = datetime.now(timezone.utc)
    item.history = [*item.history, {
        "state": state, "reason": reason, "at": item.updated_at.isoformat(),
        "category_id": item.category_id, "evidence_count": item.evidence_count,
        "decision_count": item.decision_count,
    }]


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def sync_patterns(session: Session) -> list[CategoryPatternModel]:
    evidence = list(_effective_evidence(session))
    exact_evidence = defaultdict(list)
    for event, tx in evidence:
        exact_evidence[(tx.transaction_type.value, normalize_description(tx.description))].append((event, tx))
    items = {row.signature: row for row in session.exec(select(CategoryPatternModel)).all()}
    for event, tx in evidence:
        if event.pattern:
            key = signature(event.pattern, event.match_type, tx.transaction_type.value)
            if key not in items:
                items[key] = ensure_pattern(session, event.pattern, event.match_type, tx.transaction_type.value)
    rules = session.exec(select(CategorizationRuleModel)).all()
    rules.sort(key=lambda rule: (0 if rule.origin in ("user", "accepted") else 1,
                                -rule.priority, -len(rule.keyword), rule.id or 0))
    active_categories = {category.id: category for category in session.exec(
        select(CategoryModel).where(CategoryModel.is_active.is_(True))).all()}
    prepared_rules = []
    for rule in rules:
        category = active_categories.get(rule.category_id)
        if category:
            try:
                prepared_rules.append((rule, normalize_description(rule.keyword), category))
            except ValueError:
                continue
    now = datetime.now(timezone.utc)
    for item in items.values():
        support = exact_evidence.get((item.transaction_type, item.pattern), []) if item.match_type == "exact" else [(event, tx) for event, tx in evidence
                   if tx.transaction_type.value == item.transaction_type
                   and matches(item.pattern, item.match_type, normalize_description(tx.description))]
        categories = {event.category_id for event, _ in support}
        count = len({tx.id for _, tx in support})
        decisions = len({event.decision_group or f"transaction:{tx.id}" for event, tx in support})
        digest = sha256(json.dumps(sorted((tx.id, event.id, event.category_id, event.decision_group)
                                        for event, tx in support)).encode()).hexdigest()
        if digest != item.evidence_digest:
            item.evidence_digest = digest
            item.evidence_count, item.decision_count = count, decisions
            if item.state != "accepted":
                item.category_id = next(iter(categories)) if len(categories) == 1 else None
            item.version += 1
            item.updated_at = now
        # User decisions survive recounts, archival, undo and deletion of a rule.
        if item.state in ("accepted", "rejected"):
            session.add(item)
            continue
        if not support:
            transition(item, "inactive", "Los ejemplos ya no están vigentes.")
        elif len(categories) > 1:
            transition(item, "conflict", "Has elegido categorías diferentes para este patrón.")
        elif item.snoozed_until and _utc(item.snoozed_until) > now:
            transition(item, "snoozed", "Propuesta pospuesta durante 30 días.")
        elif item.pattern in GENERIC_DESCRIPTIONS or len(item.pattern) < 3 or not any(c.isalpha() for c in item.pattern):
            transition(item, "observing", "La descripción es demasiado genérica para proponer una regla.")
        else:
            covering = []
            for rule, keyword, category in prepared_rules:
                if rule.transaction_type not in (None, item.transaction_type) or category.type.value not in ("transfer", item.transaction_type):
                    continue
                if (category.name == "Retiro de efectivo" and item.transaction_type != "expense"
                    or category.name == "Depósito de efectivo" and item.transaction_type != "income"):
                    continue
                # Contains rules cover an exact descriptor; generalized proposals
                # are only covered when the existing predicate covers their scope.
                covered = matches(keyword, rule.match_type, item.pattern) if item.match_type == "exact" else (
                    rule.match_type == "contains" and matches(keyword, "contains", item.pattern))
                if covered:
                    covering.append(rule)
            active = next((rule for rule in covering if rule.is_active), None)
            paused = next((rule for rule in covering if not rule.is_active and rule.category_id == item.category_id), None)
            if active and active.category_id == item.category_id:
                transition(item, "covered", "Una regla existente ya clasifica este patrón.")
            elif active and active.origin in ("user", "accepted"):
                transition(item, "conflict", "Una regla personal asigna otra categoría; revísala en Reglas automáticas.")
            elif paused:
                transition(item, "covered", "Ya existe una regla pausada para este patrón.")
            elif decisions >= 3 and count >= 3:
                transition(item, "pending", "Tres o más decisiones independientes coinciden.")
            else:
                transition(item, "observing", "Aún faltan tres decisiones independientes.")
        session.add(item)
    try:
        session.flush()
    except StaleDataError as error:
        session.rollback()
        raise CategoryConflictError("El aprendizaje cambió en otra sesión. Actualiza la página.") from error
    return list(items.values())


def list_patterns(session: Session) -> list[dict]:
    items = sync_patterns(session)
    evidence = list(_effective_evidence(session))
    transactions = session.exec(select(TransactionModel)).all()
    exact_evidence = defaultdict(list)
    exact_transactions = defaultdict(list)
    for event, tx in evidence:
        exact_evidence[(tx.transaction_type.value, normalize_description(tx.description))].append((event, tx))
    for tx in transactions:
        exact_transactions[(tx.transaction_type.value, normalize_description(tx.description))].append(tx)
    results = []
    for item in items:
        support = exact_evidence.get((item.transaction_type, item.pattern), []) if item.match_type == "exact" else [(event, tx) for event, tx in evidence if tx.transaction_type.value == item.transaction_type
                   and matches(item.pattern, item.match_type, normalize_description(tx.description))]
        matching = exact_transactions.get((item.transaction_type, item.pattern), []) if item.match_type == "exact" else [tx for tx in transactions if tx.transaction_type.value == item.transaction_type
                    and matches(item.pattern, item.match_type, normalize_description(tx.description))]
        results.append({
            **item.model_dump(exclude={"signature", "user_id", "evidence_digest"}),
            "examples": [{"transaction_id": tx.id, "description": tx.description,
                          "date": tx.date.isoformat(), "category_id": event.category_id}
                         for event, tx in support[:5]],
            "match_count": len(matching),
        })
    return sorted(results, key=lambda row: (row["state"] != "pending", -row["id"]))


def decide_pattern(session: Session, pattern_id: int, action: str, expected_version: int):
    item = session.get(CategoryPatternModel, pattern_id)
    if item is None:
        raise LookupError("El patrón no existe.")
    # Serialize acceptance against another acceptance/rejection, without locking
    # the whole user's account. SQLite relies on the versioned UPDATE below.
    item = session.exec(select(CategoryPatternModel).where(CategoryPatternModel.id == pattern_id)
                        .with_for_update().execution_options(populate_existing=True)).one()
    if item.state == "accepted" and action == "accept":
        rule = session.get(CategorizationRuleModel, item.rule_id) if item.rule_id else None
        if rule:
            return CategorizationRule.model_validate(rule)
        raise CategoryConflictError("La regla aceptada fue eliminada. Puedes crear una regla manualmente.")
    if item.version != expected_version:
        raise CategoryConflictError("La propuesta cambió. Actualiza y revisa sus ejemplos.")
    sync_patterns(session)
    if item.version != expected_version:
        raise CategoryConflictError("La evidencia cambió. Actualiza y revisa la propuesta.")
    if action == "accept":
        if item.state != "pending" or item.category_id is None:
            raise CategoryConflictError("La propuesta ya no tiene tres decisiones coherentes.")
        rule = CategorizationRuleModel(keyword=item.pattern, match_type=item.match_type,
            category_id=item.category_id, priority=100, origin="accepted",
            transaction_type=item.transaction_type)
        session.add(rule)
        session.flush()
        item.rule_id = rule.id
        transition(item, "accepted", "Regla creada para futuras importaciones.")
    elif action == "reject":
        if item.state == "accepted":
            raise CategoryConflictError("Administra la regla aceptada desde Reglas automáticas.")
        transition(item, "rejected", "No volver a proponer este patrón.")
    elif action == "snooze":
        if item.state != "pending":
            raise CategoryConflictError("Solo se pueden posponer propuestas pendientes.")
        item.snoozed_until = datetime.now(timezone.utc) + timedelta(days=30)
        transition(item, "snoozed", "Propuesta pospuesta durante 30 días.")
    elif action == "reactivate":
        if item.state not in ("rejected", "snoozed"):
            raise CategoryConflictError("Este patrón no está rechazado ni pospuesto.")
        item.learning_blocked = False
        item.snoozed_until = None
        transition(item, "observing", "Observación reactivada por el usuario.")
        sync_patterns(session)
    else:
        raise ValueError("La acción no es válida.")
    session.add(item)
    try:
        session.commit()
    except StaleDataError as error:
        session.rollback()
        raise CategoryConflictError("La propuesta cambió en otra sesión. Actualiza la página.") from error
    return CategorizationRule.model_validate(rule) if action == "accept" else {"state": item.state}


def suppress_deleted_rule(session: Session, rule: CategorizationRuleModel) -> None:
    directions = [rule.transaction_type] if rule.transaction_type else ["income", "expense"]
    for direction in directions:
        item = ensure_pattern(session, normalize_description(rule.keyword), rule.match_type, direction)
        if item.state != "accepted":
            transition(item, "rejected", "La regla fue eliminada; no se volverá a proponer.")
        session.add(item)
    for item in session.exec(select(CategoryPatternModel)).all():
        if item.rule_id == rule.id:
            item.rule_id = None
            item.version += 1
            session.add(item)
        if item.state != "accepted" and item.category_id == rule.category_id and (
            rule.transaction_type in (None, item.transaction_type)
            and matches(normalize_description(rule.keyword), rule.match_type, item.pattern)
        ):
            transition(item, "rejected", "La regla fue eliminada; no se volverá a proponer.")
            session.add(item)
