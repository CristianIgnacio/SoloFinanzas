from sqlmodel import Session, select

from app.models.category import CategoryModel
from app.schemas.category import Category, CategoryCreate


class DuplicateCategoryError(ValueError):
    """Indica que una categoria ya existe."""


class InvalidCategoryError(ValueError):
    """Indica que una categoria tiene datos invalidos."""


def create_category(session: Session, payload: CategoryCreate) -> Category:
    """Crea una categoria evitando nombres duplicados."""
    name = payload.name.strip()
    if not name:
        raise InvalidCategoryError("El nombre de la categoria no puede estar vacio.")

    existing = session.exec(
        select(CategoryModel).where(CategoryModel.name == name)
    ).first()
    if existing is not None:
        raise DuplicateCategoryError("Ya existe una categoria con ese nombre.")

    category = CategoryModel(
        name=name,
        type=payload.type,
        is_default=payload.is_default,
    )
    session.add(category)
    session.commit()
    session.refresh(category)
    return Category.model_validate(category)


def list_categories(session: Session) -> list[Category]:
    """Lista categorias ordenadas alfabeticamente por nombre."""
    categories = session.exec(
        select(CategoryModel).order_by(CategoryModel.name.asc())
    ).all()
    return [Category.model_validate(category) for category in categories]
