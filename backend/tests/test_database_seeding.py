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
from app.services.catalogs import DEFAULT_CATEGORIES, DEFAULT_CATEGORIZATION_RULES, RULE_CATALOG_VERSION
from app.services.statements import _categorize


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

    def test_rule_template_targets_valid_categories_once_per_direction(self) -> None:
        categories = {seed.code: seed for seed in DEFAULT_CATEGORIES}
        self.assertIn("subscriptions", categories)
        self.assertNotIn("streaming", categories)
        seen = set()
        for seed in DEFAULT_CATEGORIZATION_RULES:
            self.assertIn(seed.category_code, categories)
            self.assertIn(seed.introduced_in_version, range(RULE_CATALOG_VERSION + 1))
            category_type = categories[seed.category_code].type.value
            self.assertIn(category_type, (seed.transaction_type, "transfer"))
            identity = (seed.keyword.casefold(), seed.transaction_type)
            self.assertNotIn(identity, seen)
            seen.add(identity)

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
            ("giro en cajero", "Retiro de efectivo", 40),
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

    def test_cash_rules_match_specific_phrases_without_claiming_generic_transfers(self) -> None:
        self.seed_defaults()
        with Session(self.engine) as session:
            names = {category.id: category.name for category in session.exec(select(CategoryModel)).all()}
            for description, transaction_type, expected in (
                ("Giro en cajero automático", "expense", "Retiro de efectivo"),
                ("Depósito en efectivo sucursal", "income", "Depósito de efectivo"),
                ("Deposito por caja", "income", "Depósito de efectivo"),
                ("Transferencia enviada", "expense", None),
                ("Giro en cajero automático", "income", None),
                ("Depósito en efectivo sucursal", "expense", None),
            ):
                category_id, _, _ = _categorize(session, description, transaction_type)
                self.assertEqual(names.get(category_id), expected)

    def test_starter_rules_choose_specific_subcategories_and_direction(self) -> None:
        self.seed_defaults()
        with Session(self.engine) as session:
            codes = {category.id: category.code for category in session.exec(select(CategoryModel)).all()}
            for description, transaction_type, expected in (
                ("Compra en supermercado del barrio", "expense", "groceries"),
                ("Factura de restaurante", "expense", "restaurants"),
                ("Pago gastos comunes", "expense", "common_fees"),
                ("Compra farmacia", "expense", "medicines"),
                ("Abono remuneración octubre", "income", "salary"),
                ("Reembolso compra", "income", "refunds"),
                ("Abono remuneración octubre", "expense", None),
                ("Pago de sueldo", "expense", None),
                ("Transferencia enviada", "expense", None),
                ("Compra comercio desconocido", "expense", None),
            ):
                category_id, _, _ = _categorize(session, description, transaction_type)
                self.assertEqual(codes.get(category_id), expected, description)

    def test_versioned_install_does_not_restore_old_cash_rules(self) -> None:
        with Session(self.engine) as session:
            seed_default_categories(session)
            session.flush()
            seed_default_categorization_rules(session, since_version=0)
            session.commit()
            rules = session.exec(select(CategorizationRuleModel)).all()
            self.assertEqual(len(rules), len([seed for seed in DEFAULT_CATEGORIZATION_RULES
                                              if seed.introduced_in_version > 0]))
            self.assertFalse(any(rule.keyword == "giro en cajero" for rule in rules))

    def test_merchants_match_bank_descriptors_without_claiming_processors(self) -> None:
        self.seed_defaults()
        with Session(self.engine) as session:
            codes = {category.id: category.code for category in session.exec(select(CategoryModel)).all()}
            for description, direction, expected in (
                ("COMPRA JUMBO LA FLORIDA", "expense", "groceries"),
                ("COMPRA UNIMARC 0021", "expense", "groceries"),
                ("STARBUCKS PROVIDENCIA", "expense", "cafes"),
                ("PAYU *UBER TRIP", "expense", "ride_hailing"),
                ("UBER", "expense", "ride_hailing"),
                ("UBER *EATS", "expense", "delivery"),
                ("UBEREATS", "expense", "delivery"),
                ("PEDIDOSYA", "expense", "delivery"),
                ("NETFLIX.COM", "expense", "subscriptions"),
                ("SPOTIFY P12345", "expense", "subscriptions"),
                ("PAGO ENEL DISTRIBUCION", "expense", "electricity"),
                ("PAGO ENTEL", "expense", "internet_phone"),
                ("CRUZ VERDE 0412", "expense", "medicines"),
                ("REDSALUD DENTAL", "expense", "dental"),
                ("COMPRA H&M", "expense", "clothing"),
                ("COPEC", "expense", "fuel"),
                ("EDS COPEC 123", "expense", "fuel"),
                ("REMUNERACIONES OCTUBRE", "income", "salary"),
                ("REEMBOLSO NETFLIX", "income", "refunds"),
                ("NETFLIX", "income", None),
                ("TRANSFERENCIA COPEC PAY", "expense", None),
                ("MERCADO PAGO", "expense", None),
                ("PAYPAL", "expense", None),
                ("AMAZON", "expense", None),
                ("FALABELLA", "expense", None),
                ("MAX", "expense", None),
                ("TRANSFERENCIA A LIDER DEL GRUPO", "expense", None),
            ):
                with self.subTest(description=description, direction=direction):
                    category_id, _, _ = _categorize(session, description, direction)
                    self.assertEqual(codes.get(category_id), expected)

    def test_v2_retires_only_untouched_defaults_and_keeps_user_precedence(self) -> None:
        with Session(self.engine) as session:
            seed_default_categories(session)
            session.flush()
            categories = {category.code: category.id for category in session.exec(select(CategoryModel)).all()}
            old = CategorizationRuleModel(keyword="tienda de comestibles", category_id=categories["groceries"],
                                          origin="system", priority=30, transaction_type="expense")
            personal = CategorizationRuleModel(keyword="pago internet", category_id=categories["internet_phone"],
                                               origin="user", priority=30, transaction_type="expense")
            custom_priority = CategorizationRuleModel(keyword="pago electricidad", category_id=categories["electricity"],
                                                      origin="system", priority=80, transaction_type="expense")
            merchant_override = CategorizationRuleModel(keyword="jumbo", category_id=categories["food"],
                                                        origin="user", priority=1)
            session.add_all([old, personal, custom_priority, merchant_override])
            session.commit()
            seed_default_categorization_rules(session, since_version=1)
            session.commit()
            self.assertFalse(session.get(CategorizationRuleModel, old.id).is_active)
            self.assertTrue(session.get(CategorizationRuleModel, personal.id).is_active)
            self.assertTrue(session.get(CategorizationRuleModel, custom_priority.id).is_active)
            self.assertEqual(_categorize(session, "COMPRA JUMBO", "expense")[0], categories["food"])
            # A version 1 rule deleted earlier must not return with version 2.
            self.assertFalse(any(rule.keyword == "supermercado"
                                 for rule in session.exec(select(CategorizationRuleModel)).all()))

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

    def test_default_rules_use_stable_codes_after_categories_are_renamed(self) -> None:
        with Session(self.engine) as session:
            seed_default_categories(session)
            category = session.exec(select(CategoryModel).where(CategoryModel.code == "cash_withdrawal")).one()
            category.name = "Mi efectivo retirado"
            session.add(category)
            session.flush()
            seed_default_categorization_rules(session)
            session.commit()
            self.assertEqual(_categorize(session, "Giro en cajero", "expense")[0], category.id)
            self.assertIsNone(_categorize(session, "Giro en cajero", "income")[0])


if __name__ == "__main__":
    unittest.main()
