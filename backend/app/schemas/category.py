from __future__ import annotations

from sqlmodel import SQLModel

from app.domain.enums import CategoryType


class CategoryBase(SQLModel):
    name: str
    type: CategoryType
    parent_id: int | None = None
    is_default: bool = False
    is_active: bool = True
    sort_order: int = 0


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(SQLModel):
    name: str | None = None
    type: CategoryType | None = None
    parent_id: int | None = None
    is_active: bool | None = None
    sort_order: int | None = None


class Category(CategoryBase):
    id: int
    transaction_count: int = 0
    rule_count: int = 0


class CategoryMerge(SQLModel):
    target_category_id: int
