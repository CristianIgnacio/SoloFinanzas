from __future__ import annotations

from sqlmodel import SQLModel

from app.domain.enums import CategoryType


class CategoryBase(SQLModel):
    name: str
    type: CategoryType
    is_default: bool = True


class CategoryCreate(CategoryBase):
    pass


class Category(CategoryBase):
    id: int
