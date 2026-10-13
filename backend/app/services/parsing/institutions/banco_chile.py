from __future__ import annotations

from ..models import TabularParserProfile
from ..tabular import STANDARD_DESDE_HASTA_PERIOD_PATTERNS

BANCO_CHILE_PROFILE = TabularParserProfile(
    display_name="Banco de Chile",
    document_markers=("BANCO DE CHILE", "BANCOCHILE"),
    period_patterns=STANDARD_DESDE_HASTA_PERIOD_PATTERNS,
    income_keywords=(
        "TRASPASO DE:",
        "ABONO",
        "DEPOSITO",
        "PAGO:DE HONORARIOS",
    ),
    expense_keywords=(
        "TRASPASO A:",
        "PAGO:",
        "COMPRA",
        "GIRO",
        "CARGO",
        "COMISION",
    ),
)
