from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.core.database import get_session
from app.schemas.categorization_rule import (
    CategorizationRule,
    CategorizationRuleCreate,
)
from app.services.categorization_rules import (
    InvalidCategorizationRuleError,
    create_categorization_rule,
    delete_categorization_rule,
    get_categorization_rule,
    list_categorization_rules,
    update_categorization_rule,
)

router = APIRouter()
SessionDep = Annotated[Session, Depends(get_session)]


@router.get("/categorization-rules", response_model=list[CategorizationRule])
def get_categorization_rules(
    session: SessionDep,
    category_id: int | None = None,
) -> list[CategorizationRule]:
    """Devuelve reglas de categorizacion, opcionalmente filtradas por categoria."""
    return list_categorization_rules(session, category_id=category_id)


@router.get("/categorization-rules/{rule_id}", response_model=CategorizationRule)
def get_categorization_rule_detail(rule_id: int, session: SessionDep) -> CategorizationRule:
    """Devuelve una regla de categorizacion especifica."""
    rule = get_categorization_rule(session, rule_id)
    if not rule:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Categorization rule not found")
    return rule


@router.post(
    "/categorization-rules",
    response_model=CategorizationRule,
    status_code=status.HTTP_201_CREATED,
)
def post_categorization_rule(
    payload: CategorizationRuleCreate, session: SessionDep
) -> CategorizationRule:
    """Crea una regla de categorizacion por palabra clave."""
    try:
        return create_categorization_rule(session, payload)
    except InvalidCategorizationRuleError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error


@router.patch("/categorization-rules/{rule_id}", response_model=CategorizationRule)
def patch_categorization_rule(
    rule_id: int,
    keyword: str | None = None,
    category_id: int | None = None,
    priority: int | None = None,
    session: SessionDep = None,
) -> CategorizationRule:
    """Actualiza parcialmente una regla de categorizacion."""
    try:
        rule = update_categorization_rule(
            session, rule_id, keyword=keyword, category_id=category_id, priority=priority
        )
    except InvalidCategorizationRuleError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error
    if not rule:
        raise HTTPException(status_code=404, detail="Categorization rule not found")
    return rule


@router.delete("/categorization-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_categorization_rule_endpoint(rule_id: int, session: SessionDep) -> None:
    """Elimina una regla de categorizacion existente."""
    if not delete_categorization_rule(session, rule_id):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Categorization rule not found")
