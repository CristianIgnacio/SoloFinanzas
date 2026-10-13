from __future__ import annotations

import re

from ..models import TabularParserProfile

FALABELLA_PROFILE = TabularParserProfile(
    display_name="Banco Falabella",
    document_markers=("BANCO FALABELLA", "BANCOFALABELLA"),
    period_patterns=(
        re.compile(
            r"PER[IÍ]ODO\s+DE\s+MOVIMIENTOS\s*:?\s*"
            r"(\d{1,2}/\d{1,2}/\d{4})\s+AL\s+(\d{1,2}/\d{1,2}/\d{4})",
            re.IGNORECASE,
        ),
    ),
    income_keywords=(),
    expense_keywords=(),
    movement_start_markers=("FECHA DESCRIPCI",),
    # La celda vacia se conserva como '-'; asi no se confunde con el saldo
    # ni se depende de keywords como COMPRA, ABONO o TRANSF. en la descripcion.
    movement_columns_pattern=re.compile(
        r"(?P<description>.+?)\s+"
        r"(?P<expense>-|\$\s*[+-]?\s*\d[\d.,]*)\s+"
        r"(?P<income>-|\$\s*[+-]?\s*\d[\d.,]*)\s+"
        r"(?P<balance>\$\s*[+-]?\s*\d[\d.,]*)"
    ),
    # Es un rango de consulta que puede terminar en una fecha futura,
    # no un mes de facturacion. Se conserva para validar las fechas.
    period_from_transactions=True,
)
