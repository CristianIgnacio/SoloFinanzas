"""Additive catalog installation for new and existing users."""
import unicodedata

from sqlmodel import Session, select

from app.models import CategoryModel, CategorizationRuleModel, TransactionModel, CategoryFeedbackModel
from app.services.catalogs import (
    DEFAULT_CATEGORIES, DEFAULT_CATEGORIZATION_RULES,
    LEGACY_ROOT_ALIASES, LEGACY_CHILD_ALIASES,
    RETIRED_V1_CATEGORIZATION_RULES,
)
from app.services.categorization_rules import _normalize_keyword


def _catalog_name(name: str) -> str:
    normalized = unicodedata.normalize("NFD", name.casefold())
    return " ".join("".join(char for char in normalized
                            if not unicodedata.combining(char)).split())


def catalog_changes(session: Session, *, apply: bool = False) -> list[dict]:
    existing = list(session.exec(select(CategoryModel)).all())
    resolved: dict[str, CategoryModel | None] = {}
    result: list[dict] = []
    for seed in DEFAULT_CATEGORIES:
        parent = resolved.get(seed.parent_code) if seed.parent_code else None
        if seed.parent_code and seed.parent_code not in resolved:
            raise RuntimeError("El catálogo contiene una categoría hija sin padre.")
        if seed.parent_code and parent is None:
            result.append(dict(code=seed.code, name=seed.name, parent_code=seed.parent_code,
                               status="skipped", reason="La categoría principal está archivada o en conflicto."))
            resolved[seed.code] = None
            continue
        aliases = (LEGACY_CHILD_ALIASES if seed.parent_code else LEGACY_ROOT_ALIASES).get(seed.code, ())
        choices = {_catalog_name(seed.name), *(_catalog_name(name) for name in aliases)}
        siblings = [row for row in existing if row.parent_id == (parent.id if parent else None)]
        by_code = [row for row in existing if row.code == seed.code]
        by_name = [row for row in siblings if _catalog_name(row.name) in choices]
        matches = {row.id: row for row in [*by_code, *by_name]}
        if len(matches) > 1:
            result.append(dict(code=seed.code, name=seed.name, parent_code=seed.parent_code,
                               status="skipped", reason="Coinciden varias categorías existentes."))
            resolved[seed.code] = None
            continue
        match = next(iter(matches.values()), None)
        if match is not None and (
            match.type != seed.type
            or match.code not in (None, seed.code)
            or match.parent_id != (parent.id if parent else None)
            or not match.is_active
        ):
            result.append(dict(code=seed.code, name=seed.name, parent_code=seed.parent_code,
                               status="skipped", reason="La categoría coincidente tiene otro código, tipo, nivel o está archivada."))
            resolved[seed.code] = None
            continue
        if match is not None:
            status = "present" if match.code == seed.code else "adopted"
            if apply and match.code is None:
                match.code = seed.code
                session.add(match)
            resolved[seed.code] = match
            result.append(dict(code=seed.code, name=match.name, parent_code=seed.parent_code,
                               status=status, category_id=match.id))
            continue
        # A category with the desired name but a different parent is harmless.
        # A code collision, however, was caught above as a mismatch.
        if apply:
            match = CategoryModel(name=seed.name, code=seed.code, description=seed.description,
                                  type=seed.type, parent_id=parent.id if parent else None,
                                  is_default=True, is_active=True, sort_order=seed.sort_order)
            session.add(match)
            session.flush()
            existing.append(match)
        else:
            match = CategoryModel(id=-(len(result) + 1), name=seed.name, code=seed.code,
                                  description=seed.description, type=seed.type,
                                  parent_id=parent.id if parent else None,
                                  is_default=True, is_active=True, sort_order=seed.sort_order)
        resolved[seed.code] = match
        result.append(dict(code=seed.code, name=seed.name, parent_code=seed.parent_code,
                           status="created", category_id=match.id if apply else None))
    return result


def seed_default_categories(session: Session) -> None:
    catalog_changes(session, apply=True)


def consolidate_subscriptions(session: Session) -> None:
    """Move the former streaming default into services during catalog v2.

    Keep rule IDs and correction history. A conflicting/archived destination
    leaves the old category archived with its history intact for manual review.
    """
    source = session.exec(select(CategoryModel).where(CategoryModel.code == "streaming")).first()
    if source is None:
        return
    target = session.exec(select(CategoryModel).where(CategoryModel.code == "subscriptions")).first()
    if (target is None or not target.is_active or source.type != target.type
            or source.parent_id is None or target.parent_id is None
            or session.exec(select(CategoryModel.id).where(CategoryModel.parent_id == source.id)).first()):
        source.is_active = False
        session.add(source)
        return

    if target.icon is None and source.icon is not None:
        target.icon = source.icon
    if target.color is None and source.color is not None:
        target.color = source.color
    session.add(target)
    for transaction in session.exec(select(TransactionModel).where(
        TransactionModel.category_id == source.id
    )).all():
        transaction.category_id = target.id
        transaction.category_version += 1
        session.add(transaction)
    for rule in session.exec(select(CategorizationRuleModel).where(
        CategorizationRuleModel.category_id == source.id
    )).all():
        rule.category_id = target.id
        session.add(rule)
    for feedback in session.exec(select(CategoryFeedbackModel).where(
        (CategoryFeedbackModel.category_id == source.id)
        | (CategoryFeedbackModel.previous_category_id == source.id)
    )).all():
        if feedback.category_id == source.id:
            feedback.category_id = target.id
        if feedback.previous_category_id == source.id:
            feedback.previous_category_id = target.id
        if feedback.is_active:
            transaction = session.get(TransactionModel, feedback.transaction_id)
            if transaction:
                feedback.version = transaction.category_version
        session.add(feedback)
    session.delete(source)
    session.flush()


def seed_default_categorization_rules(session: Session, *, since_version: int = -1) -> None:
    category_rows = session.exec(select(CategoryModel)).all()
    categories = {category.code: category.id for category in category_rows
                  if category.code and category.is_active}
    rules = session.exec(select(CategorizationRuleModel)).all()
    if 1 <= since_version < 2:
        codes = {category.id: category.code for category in category_rows}
        retired = {(_normalize_keyword(seed.keyword), seed.category_code,
                    seed.transaction_type, seed.match_type, seed.priority)
                   for seed in RETIRED_V1_CATEGORIZATION_RULES}
        for rule in rules:
            if (rule.origin == "system" and rule.is_active and rule.keyword.strip()
                    and (_normalize_keyword(rule.keyword), codes.get(rule.category_id),
                         rule.transaction_type, rule.match_type, rule.priority) in retired):
                rule.is_active = False
                session.add(rule)
    existing = {(_normalize_keyword(rule.keyword), rule.category_id)
                for rule in rules if rule.keyword.strip()}
    for seed in DEFAULT_CATEGORIZATION_RULES:
        if seed.introduced_in_version <= since_version:
            continue
        category_id = categories.get(seed.category_code)
        if category_id is None:
            continue
        keyword = _normalize_keyword(seed.keyword)
        if (keyword, category_id) in existing:
            continue
        session.add(CategorizationRuleModel(keyword=keyword, category_id=category_id,
                                            priority=seed.priority, match_type=seed.match_type,
                                            origin="system", is_active=True,
                                            transaction_type=seed.transaction_type))
        existing.add((keyword, category_id))
