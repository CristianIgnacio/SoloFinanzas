import unittest

from app.domain.account_products import PdfSupport, get_financial_product, resolve_pdf_parser
from app.domain.enums import InstitutionCode
from app.domain.parsers import ParserKey
from app.services.parsing.institutions.falabella_cmr_national import (
    extract_falabella_cmr_last4,
    parse_falabella_cmr_national,
    validate_falabella_cmr_national,
)
from app.services.parsing.models import PdfImportError
from app.services.parsing.registry import _parse_document, _validate_document


SAMPLE = """ESTADO DE CUENTA
CLIENTE CMR
N° de Contrato: 999920******1111
Período Facturado 30/07/2026 29/08/2026
II. DETALLE
1. PERÍODO ANTERIOR
Saldo adeudado final periodo anterior 50.389
2. PERÍODO ACTUAL
2.1 Total Operaciones
COMPRAS NACIONALES
Santiago 30/07/2026 Comercio uno T 1.770 1.770 01/01 sep-2026 1.770
COMPRAS INTERNACIONALES
Sin Movimientos
OTROS
06/11/2025 Compra en cuotas 101.755 124.782 10/12 dic-2025 10.398
2.2 Productos o servicios voluntariamente contratados
2.3 Cargos, Comisiones, Impuestos y Abonos
S/I 12/08/2026 Pago tarjeta cmr T -18.071 0 01/01
29/08/2026 Interes saldo aplazado 1.798 1.798 1.798
III. INFORMACIÓN DE PAGO
Monto Total Facturado a Pagar 64.355
Vencimiento Próximos 4 meses
15/10/2026 10.398
(1) T: Titular : 548742******8689
"""


class FalabellaCmrParserTests(unittest.TestCase):
    def test_imports_billed_charges_without_payment_or_future_installments(self) -> None:
        candidates, errors, period = _parse_document(ParserKey.FALABELLA_CMR_NATIONAL, SAMPLE)
        self.assertEqual(period, "2026-08")
        self.assertEqual(errors, [])
        self.assertEqual([item.amount_clp for item in candidates], [-1770, -10398, -1798])
        self.assertIn("cuota 10/12", candidates[1].description)
        self.assertEqual(candidates[1].raw_data["quota_count"], 12)
        self.assertEqual(extract_falabella_cmr_last4(SAMPLE), "8689")

    def test_rejects_other_documents_and_flags_unbalanced_totals(self) -> None:
        with self.assertRaises(PdfImportError):
            validate_falabella_cmr_national("Cartola de Movimientos\nCuenta Corriente")
        _validate_document(ParserKey.FALABELLA_CMR_NATIONAL, SAMPLE)
        with self.assertRaises(PdfImportError):
            parse_falabella_cmr_national(SAMPLE.replace("64.355", "64.354"))
        warnings: list[str] = []
        parse_falabella_cmr_national(SAMPLE.replace("64.355", "64.354"), validation_warnings=warnings)
        self.assertEqual(len(warnings), 1)
        self.assertIn("Diferencia: $1.", warnings[0])
        self.assertIn("$64.355", warnings[0])

    def test_catalog_routes_cmr_products_to_credit_parser(self) -> None:
        base = get_financial_product("banco_falabella_cmr_mastercard")
        self.assertIsNotNone(base)
        self.assertEqual(base.pdf_support, PdfSupport.SAMPLE_TESTED)
        for code in (
            "banco_falabella_cmr_mastercard",
            "banco_falabella_cmr_mastercard_premium",
            "banco_falabella_cmr_mastercard_elite",
        ):
            self.assertEqual(
                resolve_pdf_parser(InstitutionCode.BANCO_FALABELLA, "credito", code),
                ParserKey.FALABELLA_CMR_NATIONAL,
            )


if __name__ == "__main__":
    unittest.main()
