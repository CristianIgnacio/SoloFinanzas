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
    _normalize_keyword,
)
from app.services.category_feedback import CategoryConflictError, forget_pattern, memory_patterns, rule_proposals
from app.services.category_patterns import list_patterns, decide_pattern
from app.domain.enums import TransactionType
from pydantic import BaseModel
from app.models import TransactionModel, CategoryModel
from app.domain.enums import CategoryType
from app.domain.normalizer import normalize_description
from sqlmodel import select

router = APIRouter()
SessionDep = Annotated[Session, Depends(get_session)]


@router.get("/categorization-rules/proposals")
def get_rule_proposals(session: SessionDep) -> list[dict]:
    try:
        result = rule_proposals(session)
        session.commit()
        return result
    except CategoryConflictError as error:
        raise HTTPException(409, str(error)) from error


@router.get("/categorization-rules/patterns")
def get_patterns(session: SessionDep) -> list[dict]:
    try:
        result = list_patterns(session)
        session.commit()
        return result
    except CategoryConflictError as error:
        raise HTTPException(409, str(error)) from error


class PatternDecision(BaseModel):
    action: str
    expected_version: int


@router.post("/categorization-rules/patterns/{pattern_id}/decision")
def post_pattern_decision(pattern_id: int, payload: PatternDecision, session: SessionDep):
    try:
        return decide_pattern(session, pattern_id, payload.action, payload.expected_version)
    except LookupError as error:
        raise HTTPException(404, str(error)) from error
    except CategoryConflictError as error:
        session.rollback()
        raise HTTPException(409, str(error)) from error
    except ValueError as error:
        raise HTTPException(400, str(error)) from error


@router.get("/categorization-rules/memory")
def get_rule_memory(session: SessionDep) -> list[dict]:
    return memory_patterns(session)


class ProposedRule(BaseModel):
    pattern: str
    match_type: str
    transaction_type: TransactionType
    category_id: int


@router.post("/categorization-rules/preview")
def preview_rule(payload: CategorizationRuleCreate, session: SessionDep) -> dict:
    category = session.get(CategoryModel, payload.category_id)
    if category is None or not category.is_active or payload.match_type not in ("exact", "contains"):
        raise HTTPException(status_code=400, detail="Selecciona una categoría activa y una coincidencia válida.")
    try:
        keyword = _normalize_keyword(payload.keyword)
    except InvalidCategorizationRuleError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    matches = []
    for transaction in session.exec(select(TransactionModel)).all():
        if category.type != CategoryType.TRANSFER and transaction.transaction_type.value != category.type.value:
            continue
        description = normalize_description(transaction.normalized_description)
        matched = description == keyword if payload.match_type == "exact" else f" {keyword} " in f" {description} "
        if matched:
            matches.append(transaction.description)
    return {"match_count": len(matches), "examples": matches[:10]}


@router.post("/categorization-rules/proposals", response_model=CategorizationRule)
def accept_rule_proposal(payload: ProposedRule, session: SessionDep) -> CategorizationRule:
    proposal = next((proposal for proposal in rule_proposals(session) if
        proposal["pattern"] == payload.pattern
        and proposal["match_type"] == payload.match_type
        and proposal["transaction_type"] == payload.transaction_type.value
        and proposal["category_id"] == payload.category_id
    ), None)
    if proposal is None:
        raise HTTPException(status_code=409, detail="La propuesta ya no tiene tres correcciones coherentes.")
    try:
        return decide_pattern(session, proposal["id"], "accept", proposal["version"])
    except CategoryConflictError as error:
        session.rollback()
        raise HTTPException(status_code=409, detail=str(error)) from error
    except InvalidCategorizationRuleError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


class ForgetPattern(BaseModel):
    pattern: str
    transaction_type: TransactionType


@router.post("/categorization-rules/memory/forget")
def post_forget_pattern(payload: ForgetPattern, session: SessionDep) -> dict:
    return {"forgotten_count": forget_pattern(session, payload.pattern, payload.transaction_type)}


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
    match_type: str | None = None,
    is_active: bool | None = None,
    session: SessionDep = None,
) -> CategorizationRule:
    """Actualiza parcialmente una regla de categorizacion."""
    try:
        rule = update_categorization_rule(
            session, rule_id, keyword=keyword, category_id=category_id, priority=priority,
            match_type=match_type, is_active=is_active,
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
