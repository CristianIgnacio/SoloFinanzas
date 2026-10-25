from __future__ import annotations

from typing import Literal

from sqlmodel import SQLModel

from app.domain.enums import CategoryType

CategoryIcon = Literal["tag", "food", "home", "bills", "transport", "health", "shopping",
                       "education", "leisure", "travel", "finance", "gifts", "income", "transfers",
                       "pets", "coffee", "sports", "work", "games", "baby",
                       "groceries", "wellbeing", "music", "books", "technology", "phone",
                       "card", "savings", "nature", "repairs"]
CategoryColor = Literal["slate", "orange", "amber", "blue", "teal", "purple", "pink", "green",
                        "red", "sky", "indigo", "brown"]


class CategoryBase(SQLModel):
    name: str
    type: CategoryType
    parent_id: int | None = None
    is_default: bool = False
    is_active: bool = True
    sort_order: int = 0
    icon: CategoryIcon | None = None
    color: CategoryColor | None = None


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(SQLModel):
    name: str | None = None
    type: CategoryType | None = None
    parent_id: int | None = None
    is_active: bool | None = None
    sort_order: int | None = None
    icon: CategoryIcon | None = None
    color: CategoryColor | None = None


class Category(CategoryBase):
    id: int
    code: str | None = None
    description: str = ""
    transaction_count: int = 0
    rule_count: int = 0


class CategoryMerge(SQLModel):
    target_category_id: int
