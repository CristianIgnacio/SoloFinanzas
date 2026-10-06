"""Database models."""

from app.models.account import AccountModel
from app.models.categorization_rule import CategorizationRuleModel
from app.models.category import CategoryModel
from app.models.internal_transfer_match import InternalTransferMatchModel
from app.models.statement import StatementModel
from app.models.transaction import TransactionModel

__all__ = [
    "AccountModel",
    "CategorizationRuleModel",
    "CategoryModel",
    "InternalTransferMatchModel",
    "StatementModel",
    "TransactionModel",
]

from app.models.user import UserModel

# Database-level ownership invariants also protect scripts and concurrent writes.
from sqlalchemy import ForeignKeyConstraint, UniqueConstraint, Index, func

for model in (AccountModel, CategoryModel, CategorizationRuleModel, StatementModel, TransactionModel, InternalTransferMatchModel):
    model.__table__.append_constraint(UniqueConstraint("user_id", "id", name=f"uq_{model.__tablename__}_owner_id"))

for model, column, target in (
    (CategoryModel, "parent_id", "categories"),
    (CategorizationRuleModel, "category_id", "categories"),
    (StatementModel, "account_id", "accounts"),
    (TransactionModel, "account_id", "accounts"),
    (TransactionModel, "statement_id", "statements"),
    (TransactionModel, "category_id", "categories"),
    (TransactionModel, "rule_id_applied", "categorization_rules"),
    (InternalTransferMatchModel, "outgoing_transaction_id", "transactions"),
    (InternalTransferMatchModel, "incoming_transaction_id", "transactions"),
):
    model.__table__.append_constraint(ForeignKeyConstraint(
        ["user_id", column], [f"{target}.user_id", f"{target}.id"],
        name=f"fk_{model.__tablename__}_{column}_owner",
    ))
StatementModel.__table__.append_constraint(UniqueConstraint("user_id", "id", "account_id", name="uq_statement_owner_account"))
TransactionModel.__table__.append_constraint(ForeignKeyConstraint(
    ["user_id", "statement_id", "account_id"], ["statements.user_id", "statements.id", "statements.account_id"], name="fk_transaction_statement_account"
))
StatementModel.__table__.append_constraint(UniqueConstraint("user_id", "account_id", "file_checksum", name="uq_statement_owner_checksum"))
Index("uq_category_owner_name", CategoryModel.user_id, func.coalesce(CategoryModel.parent_id, -1), func.lower(func.trim(CategoryModel.name)), unique=True)
Index("ix_transaction_owner_date", TransactionModel.user_id, TransactionModel.date)
