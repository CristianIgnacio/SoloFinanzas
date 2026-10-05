from __future__ import annotations

from sqlalchemy import func
from sqlmodel import Session, select

from app.domain.enums import CategoryType, TransactionType
from app.models.category import CategoryModel
from app.models.categorization_rule import CategorizationRuleModel
from app.models.transaction import TransactionModel
from app.schemas.category import Category, CategoryCreate, CategoryUpdate


class DuplicateCategoryError(ValueError):
    """Indica que una categoria ya existe dentro del mismo nivel."""


class InvalidCategoryError(ValueError):
    """Indica que una categoria tiene datos invalidos."""


class CategoryInUseError(ValueError):
    """Impide borrar categorias que conservan dependencias."""


def _normalized_name(name: str) -> str:
    normalized = " ".join(name.strip().split())
    if not normalized:
        raise InvalidCategoryError("El nombre de la categoria no puede estar vacio.")
    return normalized


def _ensure_unique_name(
    session: Session,
    name: str,
    parent_id: int | None,
    exclude_id: int | None = None,
) -> None:
    query = select(CategoryModel).where(
        func.lower(func.trim(CategoryModel.name)) == name.lower(),
    )
    query = (
        query.where(CategoryModel.parent_id.is_(None))
        if parent_id is None
        else query.where(CategoryModel.parent_id == parent_id)
    )
    existing = session.exec(query).first()
    if existing is not None and existing.id != exclude_id:
        raise DuplicateCategoryError(
            "Ya existe una categoria con ese nombre dentro del mismo nivel."
        )


def _validate_parent(
    session: Session,
    parent_id: int | None,
    category_type: CategoryType,
    category_id: int | None = None,
) -> CategoryModel | None:
    if parent_id is None:
        return None
    if parent_id <= 0 or parent_id == category_id:
        raise InvalidCategoryError("La categoria padre seleccionada no es valida.")

    parent = session.get(CategoryModel, parent_id)
    if parent is None:
        raise InvalidCategoryError("La categoria padre seleccionada no existe.")
    if parent.parent_id is not None:
        raise InvalidCategoryError("Solo se permiten categorias y subcategorias.")
    if parent.type != category_type:
        raise InvalidCategoryError(
            "La categoria y su subcategoria deben tener el mismo tipo."
        )
    if not parent.is_active:
        raise InvalidCategoryError("No se puede usar una categoria padre archivada.")
    return parent


def _usage_counts(session: Session) -> tuple[dict[int, int], dict[int, int]]:
    transaction_counts = {
        int(category_id): int(count)
        for category_id, count in session.exec(
            select(TransactionModel.category_id, func.count(TransactionModel.id))
            .where(TransactionModel.category_id.is_not(None))
            .group_by(TransactionModel.category_id)
        ).all()
        if category_id is not None
    }
    rule_counts = {
        int(category_id): int(count)
        for category_id, count in session.exec(
            select(
                CategorizationRuleModel.category_id,
                func.count(CategorizationRuleModel.id),
            ).group_by(CategorizationRuleModel.category_id)
        ).all()
    }
    return transaction_counts, rule_counts


def _to_category(
    category: CategoryModel,
    transaction_counts: dict[int, int],
    rule_counts: dict[int, int],
) -> Category:
    category_id = category.id or 0
    return Category.model_validate(category).model_copy(
        update={
            "transaction_count": transaction_counts.get(category_id, 0),
            "rule_count": rule_counts.get(category_id, 0),
        }
    )


def create_category(session: Session, payload: CategoryCreate) -> Category:
    """Crea una categoria raiz o subcategoria con un maximo de dos niveles."""
    name = _normalized_name(payload.name)
    parent_id = payload.parent_id
    _validate_parent(session, parent_id, payload.type)
    _ensure_unique_name(session, name, parent_id)

    category = CategoryModel(
        name=name,
        type=payload.type,
        parent_id=parent_id,
        is_default=payload.is_default,
        is_active=payload.is_active,
        sort_order=payload.sort_order,
    )
    session.add(category)
    session.commit()
    session.refresh(category)
    return _to_category(category, {}, {})


def list_categories(
    session: Session,
    include_inactive: bool = True,
) -> list[Category]:
    """Lista el catalogo con padres antes de sus subcategorias."""
    query = select(CategoryModel)
    if not include_inactive:
        query = query.where(CategoryModel.is_active.is_(True))
    models = session.exec(query).all()
    transaction_counts, rule_counts = _usage_counts(session)
    children_by_parent: dict[int, list[CategoryModel]] = {}
    roots: list[CategoryModel] = []
    for category in models:
        if category.parent_id is None:
            roots.append(category)
        else:
            children_by_parent.setdefault(category.parent_id, []).append(category)

    def order_key(item: CategoryModel) -> tuple[int, str, int]:
        return item.sort_order, item.name.casefold(), item.id or 0

    ordered: list[CategoryModel] = []
    for root in sorted(roots, key=order_key):
        ordered.append(root)
        ordered.extend(sorted(children_by_parent.get(root.id or 0, []), key=order_key))

    included_ids = {category.id for category in ordered}
    ordered.extend(
        sorted(
            [category for category in models if category.id not in included_ids],
            key=order_key,
        )
    )
    return [
        _to_category(category, transaction_counts, rule_counts)
        for category in ordered
    ]


def get_category(session: Session, category_id: int) -> Category | None:
    model = session.get(CategoryModel, category_id)
    if model is None:
        return None
    transaction_counts, rule_counts = _usage_counts(session)
    return _to_category(model, transaction_counts, rule_counts)


def _validate_type_change(
    session: Session,
    category: CategoryModel,
    category_type: CategoryType,
) -> None:
    children = session.exec(
        select(CategoryModel).where(CategoryModel.parent_id == category.id)
    ).all()
    if any(child.type != category_type for child in children):
        raise InvalidCategoryError(
            "Primero debes cambiar o mover las subcategorias de esta categoria."
        )

    transactions = session.exec(
        select(TransactionModel).where(TransactionModel.category_id == category.id)
    ).all()
    if category_type == CategoryType.TRANSFER:
        return
    required_transaction_type = (
        TransactionType.INCOME
        if category_type == CategoryType.INCOME
        else TransactionType.EXPENSE
    )
    if any(item.transaction_type != required_transaction_type for item in transactions):
        raise InvalidCategoryError(
            "El nuevo tipo no es compatible con los movimientos existentes."
        )


def update_category(
    session: Session,
    category_id: int,
    payload: CategoryUpdate,
) -> Category | None:
    category = session.get(CategoryModel, category_id)
    if category is None:
        return None

    name = _normalized_name(payload.name) if payload.name is not None else category.name
    category_type = payload.type or category.type
    parent_id = (
        payload.parent_id
        if "parent_id" in payload.model_fields_set
        else category.parent_id
    )
    if parent_id is not None and session.exec(
        select(CategoryModel.id).where(CategoryModel.parent_id == category_id)
    ).first() is not None:
        raise InvalidCategoryError(
            "Una categoria con subcategorias no puede convertirse en subcategoria."
        )
    _validate_parent(session, parent_id, category_type, category_id=category_id)
    _ensure_unique_name(session, name, parent_id, exclude_id=category_id)
    if category_type != category.type:
        _validate_type_change(session, category, category_type)

    category.name = name
    category.type = category_type
    category.parent_id = parent_id
    if payload.sort_order is not None:
        category.sort_order = payload.sort_order
    if payload.is_active is not None:
        category.is_active = payload.is_active
        children = session.exec(
            select(CategoryModel).where(CategoryModel.parent_id == category.id)
        ).all()
        for child in children:
            child.is_active = payload.is_active
            session.add(child)

    session.add(category)
    session.commit()
    session.refresh(category)
    return get_category(session, category_id)


def delete_category(session: Session, category_id: int) -> bool:
    category = session.get(CategoryModel, category_id)
    if category is None:
        return False
    if category.is_default:
        raise CategoryInUseError(
            "Las categorias predeterminadas se archivan en lugar de eliminarse."
        )

    transaction_count = len(
        session.exec(
            select(TransactionModel.id).where(TransactionModel.category_id == category_id)
        ).all()
    )
    rule_count = len(
        session.exec(
            select(CategorizationRuleModel.id).where(
                CategorizationRuleModel.category_id == category_id
            )
        ).all()
    )
    child_count = len(
        session.exec(
            select(CategoryModel.id).where(CategoryModel.parent_id == category_id)
        ).all()
    )
    if transaction_count or rule_count or child_count:
        raise CategoryInUseError(
            "La categoria tiene movimientos, reglas o subcategorias; archivala en su lugar."
        )

    session.delete(category)
    session.commit()
    return True


def merge_category(
    session: Session,
    source_category_id: int,
    target_category_id: int,
) -> Category | None:
    source = session.get(CategoryModel, source_category_id)
    target = session.get(CategoryModel, target_category_id)
    if source is None or target is None:
        return None
    if source.id == target.id:
        raise InvalidCategoryError("Selecciona una categoria de destino diferente.")
    if source.is_default:
        raise InvalidCategoryError(
            "Las categorias predeterminadas no se fusionan; puedes archivarlas."
        )
    if source.type != target.type:
        raise InvalidCategoryError("Solo se pueden fusionar categorias del mismo tipo.")
    if not target.is_active:
        raise InvalidCategoryError("La categoria de destino esta archivada.")
    if session.exec(
        select(CategoryModel.id).where(CategoryModel.parent_id == source.id)
    ).first() is not None:
        raise InvalidCategoryError(
            "Mueve o fusiona primero las subcategorias de la categoria de origen."
        )

    for transaction in session.exec(
        select(TransactionModel).where(TransactionModel.category_id == source.id)
    ).all():
        transaction.category_id = target.id
        session.add(transaction)
    for rule in session.exec(
        select(CategorizationRuleModel).where(
            CategorizationRuleModel.category_id == source.id
        )
    ).all():
        rule.category_id = target.id or rule.category_id
        session.add(rule)
    session.delete(source)
    session.commit()
    return get_category(session, target_category_id)
