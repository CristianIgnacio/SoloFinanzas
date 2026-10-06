import unittest

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select
from tests.fixtures import Session

from app.core.database import (
    seed_default_categories,
    seed_default_categorization_rules,
)
from app.models.category import CategoryModel
from app.models.categorization_rule import CategorizationRuleModel
from app.services.catalogs import DEFAULT_CATEGORIES, DEFAULT_CATEGORIZATION_RULES


class DatabaseSeedingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)

    def seed_defaults(self) -> None:
        with Session(self.engine) as session:
            seed_default_categories(session)
            session.flush()
            seed_default_categorization_rules(session)
            session.commit()

    def test_seeds_default_rules_with_their_categories(self) -> None:
        self.seed_defaults()

        with Session(self.engine) as session:
            categories = {
                category.id: category.name
                for category in session.exec(select(CategoryModel)).all()
            }
            rules = session.exec(select(CategorizationRuleModel)).all()

        self.assertEqual(len(categories), len(DEFAULT_CATEGORIES))
        self.assertEqual(len(rules), len(DEFAULT_CATEGORIZATION_RULES))
        self.assertIn(
            ("traspaso a", "Transferencias", 10),
            [
                (rule.keyword, categories[rule.category_id], rule.priority)
                for rule in rules
            ],
        )
        self.assertNotIn(
            "",
            [rule.keyword.strip() for rule in rules],
        )

    def test_seeding_is_idempotent(self) -> None:
        self.seed_defaults()
        self.seed_defaults()

        with Session(self.engine) as session:
            rule_count = len(
                session.exec(select(CategorizationRuleModel)).all()
            )

        self.assertEqual(rule_count, len(DEFAULT_CATEGORIZATION_RULES))

    def test_existing_rule_keeps_its_custom_priority(self) -> None:
        with Session(self.engine) as session:
            seed_default_categories(session)
            session.flush()
            transfer_category = session.exec(
                select(CategoryModel).where(
                    CategoryModel.name == "Transferencias"
                )
            ).one()
            transfer_category_id = transfer_category.id
            session.add(
                CategorizationRuleModel(
                    keyword="TRASPASO A",
                    category_id=transfer_category_id,
                    priority=1,
                )
            )
            session.commit()

        self.seed_defaults()

        with Session(self.engine) as session:
            matching_rules = session.exec(
                select(CategorizationRuleModel).where(
                    CategorizationRuleModel.category_id == transfer_category_id
                )
            ).all()
            traspaso_rules = [
                rule
                for rule in matching_rules
                if rule.keyword.strip().lower() == "traspaso a"
            ]

        self.assertEqual(len(traspaso_rules), 1)
        self.assertEqual(traspaso_rules[0].priority, 1)


if __name__ == "__main__":
    unittest.main()
