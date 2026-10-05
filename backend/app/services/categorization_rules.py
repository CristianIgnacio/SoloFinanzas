from datetime import datetime, timezone

from sqlmodel import Session, select

from app.models.categorization_rule import CategorizationRuleModel
from app.models.category import CategoryModel
from app.models.transaction import TransactionModel
from app.domain.normalizer import normalize_description
from app.schemas.categorization_rule import CategorizationRule, CategorizationRuleCreate


class InvalidCategorizationRuleError(ValueError):
    """Indica que una regla de categorizacion tiene datos invalidos."""


def _normalize_keyword(keyword: str) -> str:
    try:
        normalized = normalize_description(keyword)
    except ValueError:
        normalized = ""
    if not normalized:
        raise InvalidCategorizationRuleError(
            "La palabra clave de la regla no puede estar vacia."
        )
    return normalized


def _validate_target_category(session: Session, category_id: int) -> None:
    category = session.get(CategoryModel, category_id)
    if category is None:
        raise InvalidCategorizationRuleError("La categoria seleccionada no existe.")
    if not category.is_active:
        raise InvalidCategorizationRuleError(
            "No se puede crear una regla para una categoria archivada."
        )


def create_categorization_rule(
    session: Session, payload: CategorizationRuleCreate
) -> CategorizationRule:
    """Crea una regla para asignar categorias por palabra clave."""
    _validate_target_category(session, payload.category_id)
    rule = CategorizationRuleModel(
        keyword=_normalize_keyword(payload.keyword),
        category_id=payload.category_id,
        priority=payload.priority,
    )
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return CategorizationRule.model_validate(rule)


def list_categorization_rules(
    session: Session,
    category_id: int | None = None,
) -> list[CategorizationRule]:
    """Lista reglas de categorizacion, opcionalmente filtradas por categoria."""
    query = select(CategorizationRuleModel).order_by(
        CategorizationRuleModel.priority.desc(),
        CategorizationRuleModel.created_at.desc(),
    )
    if category_id is not None:
        query = query.where(CategorizationRuleModel.category_id == category_id)
    
    rules = session.exec(query).all()
    return [CategorizationRule.model_validate(rule) for rule in rules]


def get_categorization_rule(
    session: Session, rule_id: int
) -> CategorizationRule | None:
    """Obtiene una regla de categorizacion por ID."""
    rule = session.exec(
        select(CategorizationRuleModel).where(CategorizationRuleModel.id == rule_id)
    ).first()
    return CategorizationRule.model_validate(rule) if rule else None


def update_categorization_rule(
    session: Session,
    rule_id: int,
    keyword: str | None = None,
    category_id: int | None = None,
    priority: int | None = None,
) -> CategorizationRule | None:
    """Actualiza campos opcionales de una regla existente."""
    rule = session.exec(
        select(CategorizationRuleModel).where(CategorizationRuleModel.id == rule_id)
    ).first()
    if rule:
        if keyword is not None:
            rule.keyword = _normalize_keyword(keyword)
        if category_id is not None:
            _validate_target_category(session, category_id)
            rule.category_id = category_id
        if priority is not None:
            rule.priority = priority
        session.add(rule)
        session.commit()
        session.refresh(rule)
        return CategorizationRule.model_validate(rule)
    return None


def delete_categorization_rule(session: Session, rule_id: int) -> bool:
    """Elimina una regla y conserva las categorias asignadas previamente."""
    rule = session.exec(
        select(CategorizationRuleModel).where(CategorizationRuleModel.id == rule_id)
    ).first()
    if rule:
        try:
            applied_transactions = session.exec(
                select(TransactionModel).where(
                    TransactionModel.rule_id_applied == rule_id
                )
            ).all()
            updated_at = datetime.now(timezone.utc)
            for transaction in applied_transactions:
                transaction.rule_id_applied = None
                transaction.updated_at = updated_at
                session.add(transaction)

            session.flush()
            session.delete(rule)
            session.commit()
        except Exception:
            session.rollback()
            raise
        return True
    return False
