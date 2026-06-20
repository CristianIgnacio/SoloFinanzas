from __future__ import annotations

from sqlalchemy import Column
from sqlmodel import Field, SQLModel

from app.models._sql import enum_sql_type
from app.domain.enums import CategoryType


class CategoryModel(SQLModel, table=True):
    __tablename__ = "categories"  # type: ignore

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    type: CategoryType = Field(
        sa_column=Column(enum_sql_type(CategoryType), nullable=False),
    )
    is_default: bool = Field(default=True)
