import unittest

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.domain.enums import CategoryType
from app.models.category import CategoryModel
from app.schemas.category import CategoryCreate
from app.schemas.categorization_rule import CategorizationRuleCreate
from app.services.categories import InvalidCategoryError, create_category
from app.services.categorization_rules import (
    InvalidCategorizationRuleError,
    create_categorization_rule,
)


class CategoryAndRuleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)

    def test_rejects_blank_category_name(self) -> None:
        with Session(self.engine) as session:
            with self.assertRaises(InvalidCategoryError):
                create_category(
                    session,
                    CategoryCreate(
                        name="   ",
                        type=CategoryType.EXPENSE,
                        is_default=True,
                    ),
                )

    def test_rejects_blank_rule_keyword(self) -> None:
        with Session(self.engine) as session:
            session.add(
                CategoryModel(
                    name="Comida",
                    type=CategoryType.EXPENSE,
                    is_default=True,
                )
            )
            session.commit()
            category = session.exec(select(CategoryModel)).one()

            with self.assertRaises(InvalidCategorizationRuleError):
                create_categorization_rule(
                    session,
                    CategorizationRuleCreate(
                        keyword="   ",
                        category_id=category.id,
                        priority=20,
                    ),
                )

    def test_normalizes_rule_keyword_like_transaction_descriptions(self) -> None:
        with Session(self.engine) as session:
            category = CategoryModel(
                name="Transferencias",
                type=CategoryType.TRANSFER,
                is_default=True,
            )
            session.add(category)
            session.commit()
            session.refresh(category)

            rule = create_categorization_rule(
                session,
                CategorizationRuleCreate(
                    keyword="  Transf.  ",
                    category_id=category.id,
                    priority=20,
                ),
            )

        self.assertEqual(rule.keyword, "transf")


if __name__ == "__main__":
    unittest.main()
