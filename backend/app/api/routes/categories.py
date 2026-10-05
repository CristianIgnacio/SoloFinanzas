from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.core.database import get_session
from app.schemas.category import (
    Category,
    CategoryCreate,
    CategoryMerge,
    CategoryUpdate,
)
from app.services.categories import (
    CategoryInUseError,
    DuplicateCategoryError,
    InvalidCategoryError,
    create_category,
    delete_category,
    get_category,
    list_categories,
    merge_category,
    update_category,
)

router = APIRouter()
SessionDep = Annotated[Session, Depends(get_session)]


def _category_error(error: ValueError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))


@router.get("/categories", response_model=list[Category])
def get_categories(
    session: SessionDep,
    include_inactive: bool = Query(True),
) -> list[Category]:
    return list_categories(session, include_inactive=include_inactive)


@router.get("/categories/{category_id}", response_model=Category)
def get_category_detail(category_id: int, session: SessionDep) -> Category:
    category = get_category(session, category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Categoria no encontrada.")
    return category


@router.post("/categories", response_model=Category, status_code=status.HTTP_201_CREATED)
def post_category(payload: CategoryCreate, session: SessionDep) -> Category:
    try:
        return create_category(session, payload)
    except DuplicateCategoryError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except InvalidCategoryError as error:
        raise _category_error(error) from error


@router.patch("/categories/{category_id}", response_model=Category)
def patch_category(
    category_id: int,
    payload: CategoryUpdate,
    session: SessionDep,
) -> Category:
    try:
        category = update_category(session, category_id, payload)
    except DuplicateCategoryError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except InvalidCategoryError as error:
        raise _category_error(error) from error
    if category is None:
        raise HTTPException(status_code=404, detail="Categoria no encontrada.")
    return category


@router.post("/categories/{category_id}/merge", response_model=Category)
def post_category_merge(
    category_id: int,
    payload: CategoryMerge,
    session: SessionDep,
) -> Category:
    try:
        category = merge_category(session, category_id, payload.target_category_id)
    except InvalidCategoryError as error:
        raise _category_error(error) from error
    if category is None:
        raise HTTPException(status_code=404, detail="Categoria no encontrada.")
    return category


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category_endpoint(category_id: int, session: SessionDep) -> None:
    try:
        deleted = delete_category(session, category_id)
    except CategoryInUseError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    if not deleted:
        raise HTTPException(status_code=404, detail="Categoria no encontrada.")
