from __future__ import annotations

from sqlalchemy import Enum as SAEnum


def enum_sql_type(enum_class: type) -> SAEnum:
    """Crea un tipo SQLAlchemy Enum que persiste valores de StrEnum."""
    return SAEnum(
        enum_class,
        values_callable=lambda members: [member.value for member in members],
        native_enum=False,
        validate_strings=True,
    )
