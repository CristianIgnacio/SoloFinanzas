import unittest

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine
from tests.fixtures import Session

from app.domain.enums import CurrencyCode, InstitutionCode
from app.domain.account_products import FINANCIAL_PRODUCTS, PdfSupport
from app.models.account import AccountModel
from app.schemas.account import AccountCreate, AccountUpdate
from app.services.accounts import (
    AccountProductValidationError,
    create_account,
    list_accounts,
    update_account,
)


class AccountTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)

    def test_creates_accounts_for_every_supported_institution(self) -> None:
        institutions = (
            InstitutionCode.BANCO_DE_CHILE,
            InstitutionCode.BANCO_SANTANDER,
            InstitutionCode.COPECPAY,
            InstitutionCode.MERCADOPAGO,
            InstitutionCode.BANCO_ESTADO,
            InstitutionCode.BANCO_FALABELLA,
        )

        with Session(self.engine) as session:
            for institution in institutions:
                create_account(
                    session,
                    AccountCreate(
                        name=f"Cuenta {institution.value}",
                        institution=institution,
                        account_type="vista",
                        account_last4="1234",
                        currency=CurrencyCode.CLP,
                    ),
                )

            accounts = list_accounts(session)

        self.assertEqual(
            {account.institution for account in accounts},
            set(institutions),
        )

    def test_product_link_is_validated_and_preserved_on_legacy_edit(self) -> None:
        with Session(self.engine) as session:
            account = create_account(session, AccountCreate(
                name="Gastos diarios",
                institution=InstitutionCode.BANCO_ESTADO,
                account_type="vista",
                product_code="banco_estado_cuenta_rut",
                account_last4="1234",
            ))
            self.assertEqual(account.product_code, "banco_estado_cuenta_rut")

            edited = update_account(session, account.id, AccountUpdate(
                name="Mi CuentaRUT",
                institution=InstitutionCode.BANCO_ESTADO,
                account_type="vista",
                account_last4="1234",
            ))
            self.assertEqual(edited.product_code, "banco_estado_cuenta_rut")
            self.assertEqual(edited.account_last4, "1234")

            moved = update_account(session, account.id, AccountUpdate(
                name="Otra institución",
                institution=InstitutionCode.BANCO_DE_CHILE,
                account_type="vista",
            ))
            self.assertIsNone(moved.product_code)

    def test_product_link_rejects_unknown_or_mismatched_values(self) -> None:
        with Session(self.engine) as session:
            for code, institution, kind in (
                ("inexistente", InstitutionCode.BANCO_ESTADO, "vista"),
                ("banco_estado_cuenta_rut", InstitutionCode.BANCO_DE_CHILE, "vista"),
                ("banco_estado_cuenta_rut", InstitutionCode.BANCO_ESTADO, "credito"),
            ):
                with self.subTest(code=code, institution=institution, kind=kind):
                    with self.assertRaises(AccountProductValidationError):
                        create_account(session, AccountCreate(
                            name="Ejemplo", institution=institution,
                            account_type=kind, product_code=code,
                        ))
            self.assertEqual(list_accounts(session), [])

    def test_new_account_products_can_be_selected_with_their_account_kind(self) -> None:
        cases = (
            ("banco_de_chile_vista_general", InstitutionCode.BANCO_DE_CHILE, "vista"),
            ("banco_de_chile_ahorro_general", InstitutionCode.BANCO_DE_CHILE, "ahorro"),
            ("banco_de_chile_corriente_tradicional", InstitutionCode.BANCO_DE_CHILE, "corriente"),
            ("banco_santander_vista_general", InstitutionCode.BANCO_SANTANDER, "vista"),
            ("banco_estado_cuenta_pro", InstitutionCode.BANCO_ESTADO, "vista"),
            ("banco_estado_vista_general", InstitutionCode.BANCO_ESTADO, "vista"),
            ("banco_estado_corriente_tradicional", InstitutionCode.BANCO_ESTADO, "corriente"),
            ("banco_estado_ahorro_platino", InstitutionCode.BANCO_ESTADO, "ahorro"),
            ("banco_estado_ahorro_general", InstitutionCode.BANCO_ESTADO, "ahorro"),
            ("banco_santander_corriente_tradicional", InstitutionCode.BANCO_SANTANDER, "corriente"),
            ("banco_falabella_vista", InstitutionCode.BANCO_FALABELLA, "vista"),
        )
        with Session(self.engine) as session:
            for code, institution, kind in cases:
                with self.subTest(code=code):
                    account = create_account(session, AccountCreate(
                        name=code, institution=institution,
                        account_type=kind, product_code=code,
                    ))
                    self.assertEqual(account.product_code, code)
            self.assertEqual(len(list_accounts(session)), len(cases))

    def test_unsupported_products_cannot_be_created_or_assigned(self) -> None:
        with Session(self.engine) as session:
            account = create_account(session, AccountCreate(
                name="Tarjeta", institution=InstitutionCode.BANCO_SANTANDER,
                account_type="credito", product_code="banco_santander_worldmember_latam_pass",
            ))
            for product in FINANCIAL_PRODUCTS:
                if product.pdf_support != PdfSupport.UNSUPPORTED:
                    continue
                with self.subTest(code=product.code):
                    values = dict(name="No guardar", institution=product.institution,
                                  account_type=product.kind.value, product_code=product.code)
                    with self.assertRaisesRegex(AccountProductValidationError, "no está soportado"):
                        create_account(session, AccountCreate(**values))
                    with self.assertRaisesRegex(AccountProductValidationError, "no está soportado"):
                        update_account(session, account.id, AccountUpdate(**values))
            session.expire_all()
            accounts = list_accounts(session)
            self.assertEqual(len(accounts), 1)
            self.assertEqual(accounts[0].name, "Tarjeta")
            self.assertEqual(accounts[0].product_code, "banco_santander_worldmember_latam_pass")

    def test_credit_without_product_cannot_bypass_creation_or_change_policy(self) -> None:
        with Session(self.engine) as session:
            for kind in ("credito", "tarjeta de crédito", "tarjeta_de_credito"):
                with self.subTest(kind=kind), self.assertRaises(AccountProductValidationError):
                    create_account(session, AccountCreate(name="Crédito", institution=InstitutionCode.BANCO_ESTADO, account_type=kind))
            account = create_account(session, AccountCreate(
                name="Cuenta", institution=InstitutionCode.BANCO_ESTADO, account_type="vista",
                product_code="banco_estado_cuenta_rut",
            ))
            for explicit in ({}, {"product_code": None}):
                with self.subTest(explicit=explicit), self.assertRaises(AccountProductValidationError):
                    update_account(session, account.id, AccountUpdate(
                        name="Crédito", institution=InstitutionCode.BANCO_ESTADO, account_type="credito", **explicit,
                    ))

    def test_existing_unsupported_product_can_keep_details_or_move_to_available_product(self) -> None:
        with Session(self.engine) as session:
            legacy = AccountModel(name="Antigua", institution=InstitutionCode.BANCO_ESTADO,
                                  account_type="credito", product_code="banco_estado_visa_smart")
            session.add(legacy)
            session.commit()
            for explicit in ({}, {"product_code": "banco_estado_visa_smart"}):
                updated = update_account(session, legacy.id, AccountUpdate(
                    name="Renombrada", institution=InstitutionCode.BANCO_ESTADO,
                    account_type="credito", account_last4="1234", **explicit,
                ))
                self.assertEqual(updated.product_code, "banco_estado_visa_smart")
                self.assertEqual(updated.name, "Renombrada")
            with self.assertRaises(AccountProductValidationError):
                update_account(session, legacy.id, AccountUpdate(
                    name="Otra", institution=InstitutionCode.BANCO_ESTADO,
                    account_type="credito", product_code="banco_estado_visa_smart_plus",
                ))
            updated = update_account(session, legacy.id, AccountUpdate(
                name="Pendiente", institution=InstitutionCode.BANCO_DE_CHILE,
                account_type="credito", product_code="banco_de_chile_visa_signature",
            ))
            self.assertEqual(updated.product_code, "banco_de_chile_visa_signature")


if __name__ == "__main__":
    unittest.main()
