from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.core.database import get_session
from app.schemas.category import Category, CategoryCreate
from app.services.categories import (
    DuplicateCategoryError,
    InvalidCategoryError,
    create_category,
    list_categories,
)

router = APIRouter()
SessionDep = Annotated[Session, Depends(get_session)]


@router.get("/categories", response_model=list[Category])
def get_categories(session: SessionDep) -> list[Category]:
    """Devuelve el catalogo de categorias disponible."""
    return list_categories(session)


@router.post("/categories", response_model=Category, status_code=status.HTTP_201_CREATED)
def post_category(payload: CategoryCreate, session: SessionDep) -> Category:
    """Crea una categoria nueva validando duplicados."""
    try:
        return create_category(session, payload)
    except DuplicateCategoryError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(error),
        ) from error
    except InvalidCategoryError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error
