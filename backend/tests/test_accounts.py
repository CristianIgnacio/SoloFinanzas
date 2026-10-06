import unittest

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine
from tests.fixtures import Session

from app.domain.enums import CurrencyCode, InstitutionCode
from app.schemas.account import AccountCreate
from app.services.accounts import create_account, list_accounts


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


if __name__ == "__main__":
    unittest.main()
