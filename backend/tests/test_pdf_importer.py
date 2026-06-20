import unittest
from io import BytesIO

from pypdf import PdfWriter

from app.domain.enums import InstitutionCode
from app.domain.parsers import INSTITUTION_PARSER_MAP, ParserKey
from app.services.pdf_importer import (
    PDF_DOCUMENT_VALIDATORS,
    PDF_PARSERS,
    SANTANDER_PROFILE,
    LayoutLine,
    LayoutWord,
    PARSER_PROFILES,
    PdfImportError,
    _build_reader,
    _build_preview_lines,
    _extract_optional_period,
    _parse_document,
    _resolve_parser,
    _validate_document,
)


BANCO_CHILE_SAMPLE = """
BANCO DE CHILE
CUENTA CORRIENTE
TELEFONO : 0 DESDE : 30/12/2025 HASTA : 01/04/2026
FECHA DETALLE DE TRANSACCION SUCURSAL N° DOCTO MONTO CHEQUES MONTO DEPOSITOS SALDO
DIA/MES O CARGOS O ABONOS
30/12 SALDO INICIAL 50.156 D
07/01 TRASPASO A:Persona Ejemplo INTERNET 43.383 D
07/01 TRASPASO DE:DLOCAL CHILE SPA INTERNET 43.383 50.156 D
26/01 PAGO:GOOGLE PLAY YOUTU OFICINA BAN VI 20.200 29.800 D
02/03 PAGO:DE HONORARIOS 0111111111 CENTRAL 1.449.225 1.449.225 D
01/04 SALDO FINAL 1.438.355 D
""".strip()

SANTANDER_SAMPLE = """
BANCO SANTANDER CHILE
CARTOLA CUENTA CORRIENTE
PERIODO DESDE: 01/05/2026 HASTA: 31/05/2026
FECHA DESCRIPCION CARGO ABONO SALDO
01/05 COMPRA SUPERMERCADO CARGO 12.345 SALDO 87.655
02/05 TRANSFERENCIA RECIBIDA ABONO 50.000 SALDO 137.655
""".strip()

SANTANDER_MULTILINE_SAMPLE = """
CUENTA VISTA
ESTADO CUENTA VISTA
CARTOLA DESDE HASTA PAGINA
0-000-00-12345-6 75 27/02/2026 31/03/2026 1 DE 2
Saldo Inicial Cheques o Cargos Depositos o Abonos Saldo Final
32.010 1.219.871 1.215.397 27.536
MOVIMIENTO DE SU CUENTA SALDO DIARIO
FECHA NUMERO SUC DESCRIPCION CHEQUES Y DEPOSITOS Y SALDO
CARGOS ABONOS
02/03 93 Compra PAGO ONLINE KUSHK 20.000
--- Saldo Dia --- 12.010
04/03 93 Compra PAYU *UBER TRIP 4.516
--- Saldo Dia --- 7.494
06/03 9260651 401 0111111111 Transf. 20.000
93 0222222222 Transf a PERSONA UNO 7.494
--- Saldo Dia --- 20.000
09/03 9001812 401 0333333333 Transf. COMERCIO UNO 20.000
93 Compra RIPLEY FLORIDA 20.240
--- Saldo Dia --- 19.760
12/03 93 Compra PAYU *UBER TRIP 1.615
93 0222222222 Transf a PERSONA UNO 18.145
--- Saldo Dia --- 0
16/03 2157027 401 0444444444 Transf. PERSONA DOS 3.800
93 Compra PAYU *UBER TRIP 3.764
--- Saldo Dia --- 36
17/03 1123916 401 0222222222 Transf. PERSONA TRES 1.087.864
93 0222222222 Transf a PERSONA UNO 1.087.900
--- Saldo Dia --- 0
19/03 9260776 401 0111111111 Transf. 10.000
9260776 401 0111111111 Transf. 10.000
--- Saldo Dia --- 20.000
20/03 9260788 401 0111111111 Transf. 20.000
--- Saldo Dia --- 40.000
23/03 9260813 401 0111111111 Transf. 20.000
MENSAJES
CUENTA VISTA
ESTADO CUENTA VISTA
CARTOLA DESDE HASTA PAGINA
0-000-00-12345-6 75 27/02/2026 31/03/2026 2 DE 2
MOVIMIENTO DE SU CUENTA SALDO DIARIO
FECHA NUMERO SUC DESCRIPCION CHEQUES Y DEPOSITOS Y SALDO
CARGOS ABONOS
23/03 93 Compra PAYU *UBER TRIP 4.217
401 0555555555 Transf a COMERCIO DOS 20.000
--- Saldo Dia --- 35.783
24/03 93 Compra UBER 3.990
--- Saldo Dia --- 31.793
26/03 93 Compra DL*GOOGLE YOUTUBE 7.990
--- Saldo Dia --- 23.803
27/03 401 0555555555 Transf a COMERCIO DOS 20.000
--- Saldo Dia --- 3.803
30/03 0390684 401 UBER 3.733
9260887 401 0111111111 Transf. 20.000
--- Saldo Dia --- 27.536
Resumen de Comisiones
SIN COMISIONES EN EL PERIODO
Banco Santander Chile.
""".strip()

COPECPAY_SAMPLE = """
COPECPAY
HISTORIAL DE MOVIMIENTOS
Fecha Descripción Cargos Abonos Saldo
01/05/2026 10:30 COMPRA ESTACION DE SERVICIO -15.000
02/05/2026 09:15 RECARGA DESDE BANCO +25.000
""".strip()

COPECPAY_COLUMN_SAMPLE = """
COPECPAY
HISTORIAL DE MOVIMIENTOS
DESDE: 01/05/2026 HASTA: 31/05/2026
Fecha Descripción Cargos Abonos Saldo
03/05/2026 Recarga desde banco 0 40.000 55.000
04/05/2026 Compra combustible 18.750 0 36.250
31/05/2026 Compra tarjeta digital DOM AHUMADA 146 16.940 0 19.310
Total Cargos Total Abonos Saldo Final
35.690 40.000 19.310
""".strip()

MERCADOPAGO_SAMPLE = """
MERCADO PAGO
ESTADO DE CUENTA
03-05-2026 DINERO RECIBIDO +20.000
04-05-2026 PAGO CON QR -8.500
""".strip()

MERCADOPAGO_COLUMN_SAMPLE = """
MERCADO PAGO
REPORTE DE MOVIMIENTOS
Periodo: 01/05/2026 - 31/05/2026
Fecha Detalle Ingresos Egresos Saldo
05/05/2026 Venta QR local 35.000 0 135.000
06/05/2026 Retiro a cuenta bancaria 0 22.500 112.500
""".strip()

MERCADOPAGO_ACCOUNT_STATEMENT_SAMPLE = """
MERCADO PAGO
DESDE HASTA FECHA DE GENERACION ID DE USUARIO
01-05-2026 00:00:00 31-05-2026 23:59:59 17-06-2026 03:03:34 123456789
FECHA DE ACREDITACION TIPO DE MOVIMIENTO TIPO DE TRANSACCION ID DE TRANSACCION MONEDA MONTO DE TRANSACCION OTROS CONCEPTOS
01-05-2026 01:04:33 Abono Ganancias 1111111111111 CLP 7,00 0,00
03-05-2026 13:19:34 Cargo Pago 222222222222 CLP -5.490,00 0,00
""".strip()

BANCO_ESTADO_SAMPLE = """
BANCOESTADO
CARTOLA CUENTARUT
DESDE 01/05/2026 AL 31/05/2026
FECHA DETALLE CARGOS ABONOS SALDO
01/05/2026 COMPRA REDCOMPRA 10.000 0 90.000
02/05/2026 ABONO REMUNERACION 0 50.000 140.000
""".strip()


def _layout_line(
    text: str,
    page_index: int,
    top: float,
    words: list[tuple[str, float, float]],
) -> LayoutLine:
    return LayoutLine(
        text=text,
        page_index=page_index,
        top=top,
        words=tuple(
            LayoutWord(
                text=word,
                x0=x0,
                x1=x1,
                top=top,
                bottom=top + 8,
            )
            for word, x0, x1 in words
        ),
    )


COPECPAY_COLUMN_LAYOUT = (
    _layout_line(
        "Fecha Descripción Cargos Abonos Saldo",
        0,
        110,
        [
            ("Fecha", 35, 60),
            ("Descripción", 110, 170),
            ("Cargos", 406, 438),
            ("Abonos", 463, 498),
            ("Saldo", 534, 560),
        ],
    ),
    _layout_line(
        "03/05/2026 Recarga desde banco 0 40.000 55.000",
        0,
        132,
        [
            ("03/05/2026", 35, 86),
            ("Recarga", 110, 150),
            ("desde", 154, 186),
            ("banco", 190, 220),
            ("0", 419, 425),
            ("40.000", 466, 498),
            ("55.000", 524, 556),
        ],
    ),
    _layout_line(
        "04/05/2026 Compra combustible 18.750 0 36.250",
        0,
        154,
        [
            ("04/05/2026", 35, 86),
            ("Compra", 110, 148),
            ("combustible", 152, 210),
            ("18.750", 404, 436),
            ("0", 489, 495),
            ("36.250", 524, 556),
        ],
    ),
    _layout_line(
        "31/05/2026 Compra tarjeta digital DOM AHUMADA 146 16.940 0 19.310",
        0,
        176,
        [
            ("31/05/2026", 35, 86),
            ("Compra", 110, 148),
            ("tarjeta", 152, 190),
            ("digital", 194, 226),
            ("DOM", 230, 256),
            ("AHUMADA", 260, 306),
            ("146", 310, 326),
            ("16.940", 402, 434),
            ("0", 489, 495),
            ("19.310", 524, 556),
        ],
    ),
)


MERCADOPAGO_COLUMN_LAYOUT = (
    _layout_line(
        "Fecha Detalle Ingresos Egresos Saldo",
        0,
        120,
        [
            ("Fecha", 35, 60),
            ("Detalle", 110, 145),
            ("Ingresos", 300, 345),
            ("Egresos", 390, 432),
            ("Saldo", 500, 528),
        ],
    ),
    _layout_line(
        "05/05/2026 Venta QR local 35.000 0 135.000",
        0,
        142,
        [
            ("05/05/2026", 35, 86),
            ("Venta", 110, 138),
            ("QR", 142, 156),
            ("local", 160, 186),
            ("35.000", 306, 338),
            ("0", 410, 416),
            ("135.000", 496, 535),
        ],
    ),
    _layout_line(
        "06/05/2026 Retiro a cuenta bancaria 0 22.500 112.500",
        0,
        164,
        [
            ("06/05/2026", 35, 86),
            ("Retiro", 110, 144),
            ("a", 148, 154),
            ("cuenta", 158, 192),
            ("bancaria", 196, 240),
            ("0", 322, 328),
            ("22.500", 396, 428),
            ("112.500", 496, 535),
        ],
    ),
)


SANTANDER_REAL_LAYOUT = (
    _layout_line(
        "FECHA NUMERO SUC DESCRIPCION CHEQUES Y DEPOSITOS Y SALDO",
        1,
        258,
        [
            ("FECHA", 35, 59),
            ("NUMERO", 69, 100),
            ("SUC", 111, 126),
            ("DESCRIPCION", 188, 244),
            ("CHEQUES", 321, 361),
            ("Y", 363, 368),
            ("DEPOSITOS", 406, 453),
            ("Y", 455, 461),
            ("SALDO", 510, 538),
        ],
    ),
    _layout_line(
        "CARGOS ABONOS",
        1,
        268,
        [
            ("CARGOS", 327, 362),
            ("ABONOS", 416, 451),
        ],
    ),
    _layout_line(
        "30/03 0390684 401 UBER 3.733",
        1,
        394,
        [
            ("30/03", 35, 59),
            ("0390684", 69, 103),
            ("401", 112, 127),
            ("UBER", 136, 160),
            ("3.733", 453, 477),
        ],
    ),
)

SANTANDER_DUPLICATED_AMOUNT_SAMPLE = """
BANCO SANTANDER CHILE
CARTOLA CUENTA CORRIENTE
PERIODO DESDE: 01/05/2026 HASTA: 31/05/2026
MOVIMIENTO DE SU CUENTA SALDO DIARIO
FECHA NUMERO SUC DESCRIPCION CHEQUES Y DEPOSITOS Y SALDO
CARGOS ABONOS
01/05 93 Transf. MISMO BANCO 20.000 20.000
""".strip()

SANTANDER_DUPLICATED_AMOUNT_LAYOUT = (
    _layout_line(
        "FECHA NUMERO SUC DESCRIPCION CHEQUES Y DEPOSITOS Y SALDO",
        0,
        258,
        [
            ("FECHA", 35, 59),
            ("NUMERO", 69, 100),
            ("SUC", 111, 126),
            ("DESCRIPCION", 188, 244),
            ("CHEQUES", 321, 361),
            ("Y", 363, 368),
            ("DEPOSITOS", 406, 453),
            ("Y", 455, 461),
            ("SALDO", 510, 538),
        ],
    ),
    _layout_line(
        "CARGOS ABONOS",
        0,
        268,
        [
            ("CARGOS", 327, 362),
            ("ABONOS", 416, 451),
        ],
    ),
    _layout_line(
        "01/05 93 Transf. MISMO BANCO 20.000 20.000",
        0,
        286,
        [
            ("01/05", 35, 59),
            ("93", 69, 82),
            ("Transf.", 136, 170),
            ("MISMO", 174, 205),
            ("BANCO", 209, 244),
            ("20.000", 330, 360),
            ("20.000", 512, 542),
        ],
    ),
)

SANTANDER_AMOUNT_IN_DESCRIPTION_SAMPLE = """
BANCO SANTANDER CHILE
CARTOLA CUENTA CORRIENTE
PERIODO DESDE: 01/01/2026 HASTA: 31/01/2026
MOVIMIENTO DE SU CUENTA SALDO DIARIO
FECHA NUMERO SUC DESCRIPCION CHEQUES Y DEPOSITOS Y SALDO
CARGOS ABONOS
09/01 93 Compra FLORIDA CENTER 2 21.945
""".strip()

SANTANDER_AMOUNT_IN_DESCRIPTION_LAYOUT = (
    _layout_line(
        "FECHA NUMERO SUC DESCRIPCION CHEQUES Y DEPOSITOS Y SALDO",
        0,
        258,
        [
            ("FECHA", 35, 59),
            ("NUMERO", 69, 100),
            ("SUC", 111, 126),
            ("DESCRIPCION", 188, 244),
            ("CHEQUES", 321, 361),
            ("Y", 363, 368),
            ("DEPOSITOS", 406, 453),
            ("Y", 455, 461),
            ("SALDO", 510, 538),
        ],
    ),
    _layout_line(
        "CARGOS ABONOS",
        0,
        268,
        [
            ("CARGOS", 327, 362),
            ("ABONOS", 416, 451),
        ],
    ),
    _layout_line(
        "09/01 93 Compra FLORIDA CENTER 2 21.945",
        0,
        286,
        [
            ("09/01", 35, 59),
            ("93", 69, 82),
            ("Compra", 136, 170),
            ("FLORIDA", 174, 216),
            ("CENTER", 220, 256),
            ("2", 241, 247),
            ("21.945", 357, 386),
        ],
    ),
)


class PdfImporterTests(unittest.TestCase):
    def test_reader_accepts_encrypted_pdf_with_empty_password(self) -> None:
        writer = PdfWriter()
        writer.add_blank_page(width=100, height=100)
        writer.encrypt(user_password="", owner_password="owner")
        output = BytesIO()
        writer.write(output)

        reader, requires_password = _build_reader(output.getvalue(), None)

        self.assertTrue(reader.is_encrypted)
        self.assertFalse(requires_password)
        self.assertEqual(len(reader.pages), 1)

    def test_reader_still_requires_non_empty_pdf_password(self) -> None:
        writer = PdfWriter()
        writer.add_blank_page(width=100, height=100)
        writer.encrypt(user_password="secret", owner_password="owner")
        output = BytesIO()
        writer.write(output)

        with self.assertRaisesRegex(PdfImportError, "esta protegido"):
            _build_reader(output.getvalue(), None)

    def test_build_preview_lines_ignores_empty_lines(self) -> None:
        self.assertEqual(
            _build_preview_lines("  BANCO DE CHILE \n\n CUENTA CORRIENTE ", 2),
            ["BANCO DE CHILE", "CUENTA CORRIENTE"],
        )

    def test_parse_banco_chile_transactions(self) -> None:
        candidates, errors, period_month = _parse_document(
            ParserKey.BANCO_DE_CHILE,
            BANCO_CHILE_SAMPLE,
        )

        self.assertEqual(errors, [])
        self.assertEqual(period_month, "2026-04")
        self.assertEqual(len(candidates), 4)
        self.assertEqual(candidates[0].date.isoformat(), "2026-01-07")
        self.assertEqual(candidates[0].amount_clp, -43383)
        self.assertEqual(candidates[1].amount_clp, 43383)
        self.assertEqual(candidates[3].amount_clp, 1449225)
        self.assertIn("0111111111 CENTRAL", candidates[3].description)

    def test_resolve_parser_uses_account_institution(self) -> None:
        expected_parsers = {
            InstitutionCode.BANCO_DE_CHILE: ParserKey.BANCO_DE_CHILE,
            InstitutionCode.BANCO_SANTANDER: ParserKey.BANCO_SANTANDER,
            InstitutionCode.COPECPAY: ParserKey.COPECPAY,
            InstitutionCode.MERCADOPAGO: ParserKey.MERCADOPAGO,
            InstitutionCode.BANCO_ESTADO: ParserKey.BANCO_ESTADO,
        }

        for institution, parser_key in expected_parsers.items():
            with self.subTest(institution=institution):
                self.assertEqual(_resolve_parser(institution), parser_key)

    def test_every_institution_parser_is_fully_registered(self) -> None:
        self.assertEqual(set(INSTITUTION_PARSER_MAP), set(InstitutionCode))
        self.assertEqual(set(INSTITUTION_PARSER_MAP.values()), set(ParserKey))
        self.assertEqual(set(PARSER_PROFILES), set(ParserKey))
        self.assertEqual(set(PDF_DOCUMENT_VALIDATORS), set(ParserKey))
        self.assertEqual(set(PDF_PARSERS), set(ParserKey))

    def test_parse_santander_transactions(self) -> None:
        candidates, errors, period_month = _parse_document(
            ParserKey.BANCO_SANTANDER,
            SANTANDER_SAMPLE,
        )

        self.assertEqual(errors, [])
        self.assertEqual(period_month, "2026-05")
        self.assertEqual([item.amount_clp for item in candidates], [-12345, 50000])

    def test_santander_profile_supports_known_period_formats(self) -> None:
        standard_period = _extract_optional_period(
            "PERIODO DESDE: 01/05/2026 HASTA: 31/05/2026",
            SANTANDER_PROFILE,
        )
        positional_period = _extract_optional_period(
            "CARTOLA DESDE HASTA PAGINA\n"
            "0-000-00-12345-6 75 27/02/2026 31/03/2026 1 DE 2",
            SANTANDER_PROFILE,
        )

        self.assertEqual(standard_period[1].strftime("%Y-%m-%d"), "2026-05-31")
        self.assertEqual(positional_period[0].strftime("%Y-%m-%d"), "2026-02-27")

    def test_parse_santander_multiline_statement(self) -> None:
        _validate_document(
            ParserKey.BANCO_SANTANDER,
            SANTANDER_MULTILINE_SAMPLE,
        )
        candidates, errors, period_month = _parse_document(
            ParserKey.BANCO_SANTANDER,
            SANTANDER_MULTILINE_SAMPLE,
            layout_lines=SANTANDER_REAL_LAYOUT,
        )

        self.assertEqual(errors, [])
        self.assertEqual(period_month, "2026-03")
        self.assertEqual(len(candidates), 23)
        self.assertEqual(
            sum(item.amount_clp for item in candidates if item.amount_clp > 0),
            1215397,
        )
        self.assertEqual(
            sum(abs(item.amount_clp) for item in candidates if item.amount_clp < 0),
            1219871,
        )
        first_purchase = next(
            item for item in candidates if item.amount_clp == -20000
        )
        self.assertEqual(first_purchase.description, "Compra PAGO ONLINE KUSHK")
        transfer_income = next(
            item for item in candidates if "PERSONA DOS" in item.description
        )
        self.assertEqual(transfer_income.description, "Transf. PERSONA DOS")
        uber_refund = next(
            item for item in candidates if item.description == "UBER"
        )
        self.assertEqual(uber_refund.amount_clp, 3733)
        self.assertEqual(uber_refund.date.isoformat(), "2026-03-30")

    def test_santander_uses_layout_to_discard_balance_amounts(self) -> None:
        candidates, errors, period_month = _parse_document(
            ParserKey.BANCO_SANTANDER,
            SANTANDER_DUPLICATED_AMOUNT_SAMPLE,
            layout_lines=SANTANDER_DUPLICATED_AMOUNT_LAYOUT,
        )

        self.assertEqual(errors, [])
        self.assertEqual(period_month, "2026-05")
        self.assertEqual([item.amount_clp for item in candidates], [-20000])
        self.assertEqual(candidates[0].description, "Transf. MISMO BANCO")

    def test_santander_uses_pdf_column_when_description_has_numbers(self) -> None:
        candidates, errors, period_month = _parse_document(
            ParserKey.BANCO_SANTANDER,
            SANTANDER_AMOUNT_IN_DESCRIPTION_SAMPLE,
            layout_lines=SANTANDER_AMOUNT_IN_DESCRIPTION_LAYOUT,
        )

        self.assertEqual(errors, [])
        self.assertEqual(period_month, "2026-01")
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0].description, "Compra FLORIDA CENTER 2")
        self.assertEqual(candidates[0].amount_clp, -21945)

    def test_santander_rejects_movements_that_do_not_match_summary(self) -> None:
        incomplete_statement = SANTANDER_MULTILINE_SAMPLE.replace(
            "9260887 401 0111111111 Transf. 20.000\n",
            "",
        )

        with self.assertRaisesRegex(PdfImportError, "no cuadran con el resumen"):
            _parse_document(
                ParserKey.BANCO_SANTANDER,
                incomplete_statement,
                layout_lines=SANTANDER_REAL_LAYOUT,
            )

    def test_santander_requires_layout_for_ambiguous_unlabeled_amounts(self) -> None:
        with self.assertRaisesRegex(PdfImportError, "no cuadran con el resumen"):
            _parse_document(
                ParserKey.BANCO_SANTANDER,
                SANTANDER_MULTILINE_SAMPLE,
            )

    def test_parse_copecpay_signed_transactions_and_infers_period(self) -> None:
        candidates, errors, period_month = _parse_document(
            ParserKey.COPECPAY,
            COPECPAY_SAMPLE,
        )

        self.assertEqual(errors, [])
        self.assertEqual(period_month, "2026-05")
        self.assertEqual([item.amount_clp for item in candidates], [-15000, 25000])

    def test_parse_copecpay_charge_credit_columns(self) -> None:
        candidates, errors, period_month = _parse_document(
            ParserKey.COPECPAY,
            COPECPAY_COLUMN_SAMPLE,
            layout_lines=COPECPAY_COLUMN_LAYOUT,
        )

        self.assertEqual(errors, [])
        self.assertEqual(period_month, "2026-05")
        self.assertEqual(
            [item.description for item in candidates],
            [
                "Recarga desde banco",
                "Compra combustible",
                "Compra tarjeta digital DOM AHUMADA 146",
            ],
        )
        self.assertEqual(
            [item.amount_clp for item in candidates],
            [40000, -18750, -16940],
        )

    def test_copecpay_rejects_movements_that_do_not_match_summary(self) -> None:
        incomplete_statement = COPECPAY_COLUMN_SAMPLE.replace(
            "04/05/2026 Compra combustible 18.750 0 36.250\n",
            "",
        )

        with self.assertRaisesRegex(PdfImportError, "no cuadran con el resumen"):
            _parse_document(
                ParserKey.COPECPAY,
                incomplete_statement,
                layout_lines=COPECPAY_COLUMN_LAYOUT,
            )

    def test_parse_mercadopago_signed_transactions(self) -> None:
        candidates, errors, period_month = _parse_document(
            ParserKey.MERCADOPAGO,
            MERCADOPAGO_SAMPLE,
        )

        self.assertEqual(errors, [])
        self.assertEqual(period_month, "2026-05")
        self.assertEqual([item.amount_clp for item in candidates], [20000, -8500])

    def test_parse_mercadopago_income_expense_columns(self) -> None:
        candidates, errors, period_month = _parse_document(
            ParserKey.MERCADOPAGO,
            MERCADOPAGO_COLUMN_SAMPLE,
            layout_lines=MERCADOPAGO_COLUMN_LAYOUT,
        )

        self.assertEqual(errors, [])
        self.assertEqual(period_month, "2026-05")
        self.assertEqual([item.description for item in candidates], [
            "Venta QR local",
            "Retiro a cuenta bancaria",
        ])
        self.assertEqual([item.amount_clp for item in candidates], [35000, -22500])

    def test_parse_mercadopago_account_statement_format(self) -> None:
        candidates, errors, period_month = _parse_document(
            ParserKey.MERCADOPAGO,
            MERCADOPAGO_ACCOUNT_STATEMENT_SAMPLE,
        )

        self.assertEqual(errors, [])
        self.assertEqual(period_month, "2026-05")
        self.assertEqual([item.amount_clp for item in candidates], [7, -5490])
        self.assertEqual(
            [item.description for item in candidates],
            ["Ganancias", "Pago"],
        )

    def test_parse_banco_estado_charge_credit_columns(self) -> None:
        candidates, errors, period_month = _parse_document(
            ParserKey.BANCO_ESTADO,
            BANCO_ESTADO_SAMPLE,
        )

        self.assertEqual(errors, [])
        self.assertEqual(period_month, "2026-05")
        self.assertEqual([item.amount_clp for item in candidates], [-10000, 50000])

    def test_document_content_only_validates_selected_institution(self) -> None:
        with self.assertRaisesRegex(PdfImportError, "no parece pertenecer"):
            _validate_document(
                ParserKey.BANCO_DE_CHILE,
                "CARTOLA DE OTRO BANCO\nCUENTA CORRIENTE",
            )

        validators = (
            ParserKey.BANCO_SANTANDER,
            ParserKey.COPECPAY,
            ParserKey.MERCADOPAGO,
            ParserKey.BANCO_ESTADO,
        )
        for parser_key in validators:
            with self.subTest(parser_key=parser_key):
                with self.assertRaisesRegex(PdfImportError, "no parece pertenecer"):
                    _validate_document(
                        parser_key,
                        "CARTOLA DE OTRA INSTITUCION",
                    )


if __name__ == "__main__":
    unittest.main()
