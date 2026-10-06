import unittest
from datetime import date
from io import BytesIO

from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select
from tests.fixtures import Session

from app.domain.enums import InstitutionCode, TransactionType
from app.domain.parsers import ParserKey
from app.models.transaction import TransactionModel
from app.schemas.account import AccountCreate
from app.schemas.transaction import TransactionCandidateReview
from app.services.accounts import create_account
from app.services.pdf_importer import (
    PdfImportError,
    _parse_document,
    _validate_document,
    inspect_pdf,
)
from app.services.statements import (
    DuplicateStatementError,
    apply_transaction_reviews,
    build_transaction_previews,
    import_pdf_transactions,
)


# Datos sinteticos; reproduce el formato sin guardar informacion del titular.
FALABELLA_HEADER = """Cartola de Movimientos
05 de October de 2026
Cuenta Corriente
PERSONA EJEMPLO Cuenta corriente 1 000 000000 0
Período de movimientos 01/09/2026 al 1/01/2027
Saldo Disponible $2.823
Saldo Contable $2.823
Listado de movimientos
FECHA DESCRIPCIÓN CARGO ABONO SALDO
"""
FALABELLA_ROWS = [
    "01/09/2026 Transf. de Persona Ejemplo - $ 10,000 $ 10,000",
    "04/09/2026 Transf. de Persona Ejemplo - $ 20,000 $ 30,000",
    "04/09/2026 RESTAURANTE UNO SANTIAGO $ 29,920 - $ 80",
    "08/09/2026 Transf. de Persona Ejemplo - $ 40,000 $ 40,080",
    "08/09/2026 WEBPAY $ 39,900 - $ 180",
    "15/09/2026 Transf. de Persona Ejemplo - $ 10,000 $ 10,180",
    "15/09/2026 COMERCIO DOS SANTIAGO $ 5,022 - $ 5,158",
    "15/09/2026 PARKING CENTRO SANTIAGO $ 1,700 - $ 3,458",
]
EXPECTED_AMOUNTS = [10000, 20000, -29920, 40000, -39900, 10000, -5022, -1700]
FALABELLA_SAMPLE = FALABELLA_HEADER + "\n".join(FALABELLA_ROWS) + "\nPágina 1 de 1"


def falabella_pdf(*, password: str | None = None, pages: int = 1) -> bytes:
    """PDF en memoria con encabezado sin nombre del banco, como el logo raster."""
    writer = PdfWriter()
    font = writer._add_object(DictionaryObject({
        NameObject("/Type"): NameObject("/Font"),
        NameObject("/Subtype"): NameObject("/Type1"),
        NameObject("/BaseFont"): NameObject("/Helvetica"),
        NameObject("/Encoding"): NameObject("/WinAnsiEncoding"),
    }))
    for page_number in range(pages):
        page = writer.add_blank_page(width=595, height=842)
        page[NameObject("/Resources")] = DictionaryObject({
            NameObject("/Font"): DictionaryObject({NameObject("/F1"): font}),
        })
        rows = FALABELLA_ROWS if pages == 1 else FALABELLA_ROWS[page_number * 4:(page_number + 1) * 4]
        lines = FALABELLA_HEADER.splitlines() + rows + [f"Página {page_number + 1} de {pages}"]
        commands = []
        for index, line in enumerate(lines):
            escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            commands.append(f"BT /F1 10 Tf 1 0 0 1 30 {800 - index * 20} Tm ({escaped}) Tj ET")
        stream = DecodedStreamObject()
        stream.set_data("\n".join(commands).encode("cp1252"))
        page[NameObject("/Contents")] = writer._add_object(stream)
    if password is not None:
        writer.encrypt(password)
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


class FalabellaPdfImporterTests(unittest.TestCase):
    def test_reads_columns_without_including_balances(self) -> None:
        candidates, errors, period = _parse_document(ParserKey.BANCO_FALABELLA, FALABELLA_SAMPLE)

        self.assertEqual(errors, [])
        self.assertEqual(period, "2026-09")
        self.assertEqual([item.amount_clp for item in candidates], EXPECTED_AMOUNTS)
        self.assertEqual(sum(item.amount_clp for item in candidates if item.amount_clp > 0), 80000)
        self.assertEqual(sum(-item.amount_clp for item in candidates if item.amount_clp < 0), 76542)
        self.assertEqual(candidates[0].date, date(2026, 9, 1))
        self.assertEqual(candidates[0].description, "Transf. de Persona Ejemplo")
        self.assertEqual(candidates[0].source_line, FALABELLA_ROWS[0])
        self.assertEqual(candidates[0].transaction_type, TransactionType.INCOME)
        self.assertEqual(candidates[2].transaction_type, TransactionType.EXPENSE)
        self.assertEqual(len({item.source_id for item in candidates}), 8)

    def test_inspects_real_pdf_extraction_with_multiple_pages_and_password(self) -> None:
        for pages, password in ((1, None), (2, None), (1, "clave-ejemplo")):
            with self.subTest(pages=pages, password=password):
                preview = inspect_pdf(
                    file_name="falabella.pdf",
                    file_bytes=falabella_pdf(pages=pages, password=password),
                    institution=InstitutionCode.BANCO_FALABELLA,
                    password=password,
                )
                self.assertEqual(preview.parser_key, ParserKey.BANCO_FALABELLA)
                self.assertEqual(preview.page_count, pages)
                self.assertEqual(preview.is_encrypted, password is not None)
                self.assertEqual(preview.used_password, password is not None)
                self.assertEqual(preview.period_month, "2026-09")
                self.assertEqual(preview.parsing_errors, [])
                self.assertEqual([item.amount_clp for item in preview.candidate_transactions], EXPECTED_AMOUNTS)

    def test_validates_structure_when_bank_name_is_not_selectable(self) -> None:
        for prefix in ("", "Banco Falabella\n"):
            _validate_document(ParserKey.BANCO_FALABELLA, prefix + FALABELLA_SAMPLE)
        _validate_document(
            ParserKey.BANCO_FALABELLA,
            FALABELLA_SAMPLE.replace("PERSONA EJEMPLO", "CAMILA SANTANDER"),
        )
        for document in (
            "Banco Falabella\nEstado de cuenta CMR\n01/09/2026 COMPRA $ 10,000",
            FALABELLA_SAMPLE.replace("Cuenta Corriente\n", "Tarjeta CMR\n"),
            FALABELLA_SAMPLE.replace("CARGO ABONO SALDO", "MONTO CUOTAS"),
            "BANCO SANTANDER\n" + FALABELLA_SAMPLE,
            "01/09/2026 COMERCIO - $ 1,000 $ 1,000",
        ):
            with self.subTest(document=document[:50]):
                with self.assertRaisesRegex(PdfImportError, "Banco Falabella"):
                    _validate_document(ParserKey.BANCO_FALABELLA, document)
        with self.assertRaises(PdfImportError):
            _validate_document(ParserKey.BANCO_SANTANDER, FALABELLA_SAMPLE)

    def test_uses_columns_even_when_description_contains_numbers_or_income_keywords(self) -> None:
        rows = (
            "01/09/2026 ABONO LOCAL 1234 $ 1,234,567 - $ 0",
            "02/09/2026 COMPRA REEMBOLSADA $ 0 $ 1.234.567 $ 1.234.567",
            "03/09/2026 Transf. a Persona $ 2,000.00 - $ -2,000.00",
        )
        candidates, errors, _ = _parse_document(
            ParserKey.BANCO_FALABELLA, FALABELLA_HEADER + "\n".join(rows)
        )
        self.assertEqual(errors, [])
        self.assertEqual([item.amount_clp for item in candidates], [-1234567, 1234567, -2000])
        self.assertEqual(candidates[0].description, "ABONO LOCAL 1234")

    def test_reports_ambiguous_incomplete_or_fractional_rows(self) -> None:
        for columns in (
            "$ 1,000 $ 2,000 $ 3,000",
            "- - $ 3,000",
            "$ 1,000 $ 3,000",
            "$ -1,000 - $ 3,000",
            "$ 1,000.50 - $ 3,000",
            "$ 1,000 - $ 3,000.50",
        ):
            with self.subTest(columns=columns):
                candidates, errors, _ = _parse_document(
                    ParserKey.BANCO_FALABELLA,
                    FALABELLA_HEADER + f"01/09/2026 COMERCIO {columns}",
                )
                self.assertEqual(candidates, [])
                self.assertEqual(len(errors), 1)

    def test_page_footer_words_inside_merchants_do_not_stop_reading(self) -> None:
        candidates, errors, _ = _parse_document(
            ParserKey.BANCO_FALABELLA,
            FALABELLA_SAMPLE.replace("WEBPAY", "LIBRERIA PAGINA UNO"),
        )
        self.assertEqual(errors, [])
        self.assertEqual([item.amount_clp for item in candidates], EXPECTED_AMOUNTS)

    def test_preserves_period_validation_and_uses_latest_movement_month(self) -> None:
        candidates, errors, period = _parse_document(
            ParserKey.BANCO_FALABELLA,
            FALABELLA_SAMPLE
            + "\nFECHA DESCRIPCIÓN CARGO ABONO SALDO\n"
            + "01/10/2026 COMERCIO $ 1,000 - $ 2,458\n"
            + "31/01/2027 FUERA DE PERIODO $ 100 - $ 2,358",
        )
        self.assertEqual(len(candidates), 9)
        self.assertEqual(len(errors), 1)
        self.assertIn("fuera del periodo", errors[0])
        self.assertEqual(period, "2026-10")
        with self.assertRaisesRegex(PdfImportError, "anterior"):
            _parse_document(
                ParserKey.BANCO_FALABELLA,
                FALABELLA_SAMPLE.replace("1/01/2027", "1/01/2026"),
            )

    def test_preview_review_and_import_keep_existing_flow_and_duplicate_protection(self) -> None:
        engine = create_engine("sqlite://", poolclass=StaticPool)
        SQLModel.metadata.create_all(engine)
        self.addCleanup(engine.dispose)
        preview = inspect_pdf(
            file_name="falabella.pdf",
            file_bytes=falabella_pdf(),
            institution=InstitutionCode.BANCO_FALABELLA,
        )
        with Session(engine) as session:
            account = create_account(session, AccountCreate(
                name="Cuenta Falabella", institution=InstitutionCode.BANCO_FALABELLA,
                account_type="corriente", account_last4="1234",
            ))
            rows = build_transaction_previews(session, preview.candidate_transactions)
            reviewed, category_overrides = apply_transaction_reviews(session, preview.candidate_transactions, [
                TransactionCandidateReview(
                    source_id=row.source_id, source_line=row.source_line,
                    transaction_type=row.transaction_type, category_id=row.suggested_category_id,
                )
                for row in rows
            ])
            payload = dict(
                account_id=account.id, file_name=preview.file_name,
                file_checksum=preview.file_checksum, raw_path="data/raw/falabella-sintetico.pdf",
                period_month=preview.period_month, candidates=reviewed,
                category_overrides=category_overrides,
            )
            result = import_pdf_transactions(session, **payload)
            self.assertEqual(result.result.inserted_count, 8)
            self.assertEqual(result.statement.period_month, "2026-09")
            stored = session.exec(select(TransactionModel).order_by(TransactionModel.id)).all()
            self.assertEqual([item.amount_clp for item in stored], EXPECTED_AMOUNTS)
            with self.assertRaises(DuplicateStatementError):
                import_pdf_transactions(session, **payload)


if __name__ == "__main__":
    unittest.main()
