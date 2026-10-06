import unittest

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select
from tests.fixtures import Session

from app.domain.enums import CategoryType
from app.models.category import CategoryModel
from app.schemas.category import CategoryCreate
from app.schemas.categorization_rule import CategorizationRuleCreate
from app.services.categories import (
    CategoryInUseError,
    InvalidCategoryError,
    create_category,
    delete_category,
    list_categories,
    update_category,
)
from app.schemas.category import CategoryUpdate
from app.models.transaction import TransactionModel
from app.domain.enums import TransactionType
from datetime import date
from app.services.categorization_rules import (
    InvalidCategorizationRuleError,
    create_categorization_rule,
    delete_categorization_rule,
)
from app.services.transactions import list_transactions


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
            category_id = category.id

            rule = create_categorization_rule(
                session,
                CategorizationRuleCreate(
                    keyword="  Transf.  ",
                    category_id=category_id,
                    priority=20,
                ),
            )

        self.assertEqual(rule.keyword, "transf")

    def test_deleting_applied_rule_preserves_category_and_clears_reference(self) -> None:
        with Session(self.engine) as session:
            category = CategoryModel(
                name="Suscripciones",
                type=CategoryType.EXPENSE,
                is_default=True,
            )
            session.add(category)
            session.commit()
            session.refresh(category)
            category_id = category.id
            rule = create_categorization_rule(
                session,
                CategorizationRuleCreate(
                    keyword="netflix",
                    category_id=category_id,
                    priority=20,
                ),
            )
            transaction = TransactionModel(
                account_id=1,
                statement_id=1,
                date=date(2026, 9, 1),
                description="Netflix",
                normalized_description="netflix",
                amount_clp=-8990,
                transaction_type=TransactionType.EXPENSE,
                category_id=category_id,
                category_source="rule",
                rule_id_applied=rule.id,
            )
            session.add(transaction)
            session.commit()
            session.refresh(transaction)
            transaction_id = transaction.id

            self.assertTrue(delete_categorization_rule(session, rule.id))
            preserved = session.get(TransactionModel, transaction_id)

        self.assertIsNotNone(preserved)
        self.assertEqual(preserved.category_id, category_id)
        self.assertIsNone(preserved.rule_id_applied)

    def test_supports_two_levels_and_rejects_a_third(self) -> None:
        with Session(self.engine) as session:
            parent = create_category(
                session,
                CategoryCreate(name="Comida", type=CategoryType.EXPENSE),
            )
            child = create_category(
                session,
                CategoryCreate(
                    name="Restaurantes",
                    type=CategoryType.EXPENSE,
                    parent_id=parent.id,
                ),
            )

            with self.assertRaises(InvalidCategoryError):
                create_category(
                    session,
                    CategoryCreate(
                        name="Almuerzos",
                        type=CategoryType.EXPENSE,
                        parent_id=child.id,
                    ),
                )

    def test_archiving_parent_archives_children_without_deleting_history(self) -> None:
        with Session(self.engine) as session:
            parent = create_category(
                session,
                CategoryCreate(name="Comida", type=CategoryType.EXPENSE),
            )
            child = create_category(
                session,
                CategoryCreate(
                    name="Supermercado",
                    type=CategoryType.EXPENSE,
                    parent_id=parent.id,
                ),
            )
            update_category(
                session,
                parent.id,
                CategoryUpdate(is_active=False),
            )
            categories = {item.id: item for item in list_categories(session)}

        self.assertFalse(categories[parent.id].is_active)
        self.assertFalse(categories[child.id].is_active)

    def test_used_category_must_be_archived_instead_of_deleted(self) -> None:
        with Session(self.engine) as session:
            category = CategoryModel(
                name="Comida",
                type=CategoryType.EXPENSE,
                is_default=False,
            )
            session.add(category)
            session.commit()
            session.refresh(category)
            session.add(
                TransactionModel(
                    account_id=1,
                    statement_id=1,
                    date=date(2026, 8, 1),
                    description="Compra",
                    normalized_description="compra",
                    amount_clp=-1000,
                    transaction_type=TransactionType.EXPENSE,
                    category_id=category.id,
                )
            )
            session.commit()

            with self.assertRaises(CategoryInUseError):
                delete_category(session, category.id)

    def test_parent_filter_includes_direct_and_child_transactions(self) -> None:
        with Session(self.engine) as session:
            parent = create_category(
                session,
                CategoryCreate(name="Comida", type=CategoryType.EXPENSE),
            )
            child = create_category(
                session,
                CategoryCreate(
                    name="Supermercado",
                    type=CategoryType.EXPENSE,
                    parent_id=parent.id,
                ),
            )
            for category_id in (parent.id, child.id):
                session.add(
                    TransactionModel(
                        account_id=1,
                        statement_id=1,
                        date=date(2026, 8, 1),
                        description="Compra",
                        normalized_description="compra",
                        amount_clp=-1000,
                        transaction_type=TransactionType.EXPENSE,
                        category_id=category_id,
                    )
                )
            session.commit()

            parent_results = list_transactions(session, category_id=parent.id)
            child_results = list_transactions(session, category_id=child.id)

        self.assertEqual(len(parent_results), 2)
        self.assertEqual(len(child_results), 1)


if __name__ == "__main__":
    unittest.main()
