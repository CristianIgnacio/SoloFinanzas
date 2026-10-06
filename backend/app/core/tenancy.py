"""Fail-closed ORM boundary used by every authenticated business request.

Unscoped Session is reserved for migrations and identity provisioning. TenantSession
forbids Core/text and bulk DML; selects (including aggregates) are scoped centrally.
"""
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import event, inspect
from sqlalchemy.orm import with_loader_criteria
from sqlmodel import Session, select

from app.models import (
    AccountModel, CategoryModel, CategorizationRuleModel, StatementModel,
    TransactionModel, InternalTransferMatchModel,
)
from app.models.user import OwnedModel, UserModel

OWNED_MODELS = (AccountModel, CategoryModel, CategorizationRuleModel,
                StatementModel, TransactionModel, InternalTransferMatchModel)


class TenantSession(Session):
    def __init__(self, *args, user_id: UUID, **kwargs):
        super().__init__(*args, **kwargs)
        self.info["user_id"] = UUID(str(user_id))

    def get(self, entity, ident, **kwargs):
        if entity in OWNED_MODELS:
            # Do not permit the identity map fast path to bypass ownership.
            return self.exec(select(entity).where(entity.id == ident)).first()
        if entity is UserModel:
            return self.exec(select(UserModel).where(UserModel.id == ident)).first()
        return super().get(entity, ident, **kwargs)


@event.listens_for(TenantSession, "do_orm_execute")
def scope_select(state):
    if not state.is_select or not state.is_orm_statement:
        raise RuntimeError("TenantSession only permits ORM SELECT; mutate loaded objects.")
    owner = state.session.info["user_id"]
    state.statement = state.statement.options(with_loader_criteria(UserModel, UserModel.id == owner, include_aliases=True))
    for model in OWNED_MODELS:
        state.statement = state.statement.options(
            with_loader_criteria(model, model.user_id == owner, include_aliases=True)
        )


def require_reference(session, model, ident):
    if ident is None:
        return None
    value = session.get(model, ident)
    if value is None:
        raise HTTPException(404, "El recurso solicitado no existe.")
    return value


@event.listens_for(TenantSession, "before_flush")
def validate_writes(session, *_):
    owner = session.info["user_id"]
    for obj in list(session.new) + list(session.dirty) + list(session.deleted):
        if not isinstance(obj, OwnedModel):
            raise RuntimeError("Identity changes require the identity service.")
        if obj in session.new and obj.user_id is None:
            obj.user_id = owner
        if obj.user_id != owner or (
            obj not in session.new and inspect(obj).attrs.user_id.history.has_changes()
        ):
            raise HTTPException(404, "El recurso solicitado no existe.")
        if obj in session.deleted:
            continue
        with session.no_autoflush:
            if isinstance(obj, CategoryModel):
                require_reference(session, CategoryModel, obj.parent_id)
            elif isinstance(obj, CategorizationRuleModel):
                require_reference(session, CategoryModel, obj.category_id)
            elif isinstance(obj, StatementModel):
                require_reference(session, AccountModel, obj.account_id)
                obj.raw_path = None
            elif isinstance(obj, TransactionModel):
                require_reference(session, AccountModel, obj.account_id)
                statement = require_reference(session, StatementModel, obj.statement_id)
                if statement.account_id != obj.account_id:
                    raise HTTPException(400, "La cartola no corresponde a la cuenta.")
                require_reference(session, CategoryModel, obj.category_id)
                require_reference(session, CategorizationRuleModel, obj.rule_id_applied)
                obj.raw_data = None
            elif isinstance(obj, InternalTransferMatchModel):
                require_reference(session, TransactionModel, obj.outgoing_transaction_id)
                require_reference(session, TransactionModel, obj.incoming_transaction_id)
