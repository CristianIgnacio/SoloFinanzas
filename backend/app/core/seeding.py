from sqlmodel import Session, select
from app.models import CategoryModel, CategorizationRuleModel
from app.services.catalogs import DEFAULT_CATEGORIES, DEFAULT_CATEGORIZATION_RULES
from app.services.categorization_rules import _normalize_keyword

def seed_default_categories(session: Session) -> None:
    """Inserta categorias predeterminadas que aun no existan en la base."""
    existing_by_name = {
        category.name: category
        for category in session.exec(select(CategoryModel)).all()
    }
    roots = [category for category in DEFAULT_CATEGORIES if category.parent_name is None]
    children = [category for category in DEFAULT_CATEGORIES if category.parent_name is not None]

    for category in roots:
        if category.name in existing_by_name:
            continue
        model = CategoryModel(
            name=category.name,
            type=category.type,
            is_default=category.is_default,
            is_active=category.is_active,
            sort_order=category.sort_order,
        )
        session.add(model)
        session.flush()
        existing_by_name[category.name] = model

    for category in children:
        if category.name in existing_by_name:
            continue
        parent = existing_by_name.get(category.parent_name or "")
        if parent is None:
            raise ValueError(
                f"No existe la categoria padre predeterminada '{category.parent_name}'."
            )
        model = CategoryModel(
            name=category.name,
            type=category.type,
            parent_id=parent.id,
            is_default=category.is_default,
            is_active=category.is_active,
            sort_order=category.sort_order,
        )
        session.add(model)
        session.flush()
        existing_by_name[category.name] = model


def seed_default_categorization_rules(session: Session) -> None:
    """Inserta reglas predeterminadas vinculandolas a sus categorias base."""
    categories_by_name = {
        category.name: category.id
        for category in session.exec(select(CategoryModel)).all()
    }
    existing_rules = {
        (_normalize_keyword(rule.keyword), rule.category_id)
        for rule in session.exec(select(CategorizationRuleModel)).all()
        if rule.keyword.strip()
    }

    for rule in DEFAULT_CATEGORIZATION_RULES:
        category_id = categories_by_name.get(rule.category_name)
        if category_id is None:
            raise ValueError(
                f"No existe la categoria predeterminada '{rule.category_name}' "
                f"para la regla '{rule.keyword}'."
            )

        normalized_keyword = _normalize_keyword(rule.keyword)
        rule_key = (normalized_keyword, category_id)
        if rule_key in existing_rules:
            continue

        session.add(
            CategorizationRuleModel(
                keyword=normalized_keyword,
                category_id=category_id,
                priority=rule.priority,
            )
        )
        existing_rules.add(rule_key)
