import unittest

from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine, select

from tests.fixtures import Session

from app.domain.enums import InstitutionCode
from app.domain.parsers import ParserKey
from app.models.transaction import TransactionModel
from app.schemas.account import AccountCreate
from app.services.accounts import create_account
from app.services.statements import import_pdf_transactions
from app.services.parsing.institutions.santander_credit_national import (
    parse_santander_credit_national,
    validate_santander_credit_national,
)
from app.services.parsing.models import PdfImportError
from app.services.parsing.registry import _validate_document


SAMPLE = """ESTADO DE CUENTA EN MONEDA NACIONAL DE TARJETA DE CRÉDITO
Nº DE TARJETA DE CRÉDITO XXXX XXXX XXXX 1234
PERIODO FACTURADO 23/07/2026 25/08/2026
II. DETALLE
2. PERIODO ACTUAL
1. TOTAL OPERACIONES $ 130.000
MOVIMIENTOS TARJETA XXXX-1234 $ 130.000
SANTIAGO 24/07/2026 COMERCIO EJEMPLO $ 100.000
25/07/2026 COMPRA EN CUOTAS TRES CUOTAS PREC 0,00 % $ 90.000 $ 90.000 01/03 $ 30.000
31/07/2026 MONTO CANCELADO $ -50.000
EMISOR CLIENTE
COMPROBANTE DE PAGO
09/09/2026 $ 132.000
2. PERIODO ACTUAL
2. PRODUCTOS O SERVICIOS VOLUNTARIAMENTE CONTRATADOS $ 0
3. CARGOS, COMISIONES, IMPUESTOS Y ABONOS $ 2.000
25/08/2026 INTERESES $ 2.000
4. INFORMACION COMPRAS EN CUOTAS EN EL PERIODO $ 10.000
25/08/2026 OTRA COMPRA 03 CUOTAS $ 30.000 $ 10.000
III. INFORMACIÓN DE PAGO
MONTO TOTAL FACTURADO A PAGAR $ 132.000
"""


class SantanderCreditParserTests(unittest.TestCase):
    def test_billed_charges_reconcile_without_payment_coupon_or_future_quota(self) -> None:
        candidates, errors, period = parse_santander_credit_national(SAMPLE)
        self.assertEqual(period, "2026-08")
        self.assertEqual(errors, [])
        self.assertEqual([item.amount_clp for item in candidates], [-100000, -30000, -2000])
        self.assertEqual(candidates[1].raw_data["quota_number"], 1)
        self.assertEqual(candidates[1].raw_data["purchase_amount_clp"], 90000)
        self.assertIn("cuota 1/3", candidates[1].description)

    def test_rejects_wrong_document_and_inconsistent_total(self) -> None:
        with self.assertRaises(PdfImportError):
            validate_santander_credit_national("CARTOLA CUENTA CORRIENTE SANTANDER")
        with self.assertRaises(PdfImportError):
            parse_santander_credit_national(SAMPLE.replace("$ 132.000\n", "$ 131.999\n"))
        _validate_document(ParserKey.SANTANDER_CREDIT_NATIONAL, SAMPLE)

    def test_import_keeps_installment_details_without_recording_payment(self) -> None:
        engine = create_engine("sqlite://", poolclass=StaticPool)
        SQLModel.metadata.create_all(engine)
        self.addCleanup(engine.dispose)
        candidates, _, period = parse_santander_credit_national(SAMPLE)
        with Session(engine) as session:
            account = create_account(session, AccountCreate(
                name="Tarjeta de prueba",
                institution=InstitutionCode.BANCO_SANTANDER,
                account_type="credito",
                product_code="banco_santander_worldmember_latam_pass",
                account_last4="1234",
            ))
            result = import_pdf_transactions(
                session,
                account_id=account.id,
                file_name="credito-sintetico.pdf",
                file_checksum="test-santander-credit",
                raw_path=None,
                period_month=period,
                candidates=candidates,
            )
            self.assertEqual(result.result.inserted_count, 3)
            stored = session.exec(select(TransactionModel).order_by(TransactionModel.id)).all()
            self.assertEqual(sum(-item.amount_clp for item in stored), 132000)
            self.assertEqual(stored[1].raw_data["quota_count"], 3)


if __name__ == "__main__":
    unittest.main()
