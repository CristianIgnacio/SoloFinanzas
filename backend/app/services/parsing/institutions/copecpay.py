from __future__ import annotations

from ..models import LayoutColumnProfile, TabularParserProfile
from ..tabular import (
    STANDARD_DESDE_HASTA_PERIOD_PATTERNS,
    _extract_copecpay_summary_totals,
)

COPECPAY_PROFILE = TabularParserProfile(
    display_name="CopecPay",
    document_markers=("COPECPAY", "COPEC PAY"),
    period_patterns=STANDARD_DESDE_HASTA_PERIOD_PATTERNS,
    income_keywords=(
        "RECARGA",
        "CARGA",
        "ABONO",
        "DEVOLUCION",
        "REEMBOLSO",
        "TRANSFERENCIA RECIBIDA",
        "GANANCIA",
        "TRANSFERENCIA DE",
    ),
    expense_keywords=(
        "COMPRA",
        "CONSUMO",
        "PAGO",
        "RETIRO",
        "COMISION",
        "TRANSFERENCIA ENVIADA",
        "TRANSFERENCIA A",
    ),
    movement_start_markers=("FECHA DESCRIPCI",),
    movement_end_markers=("TOTAL CARGOS TOTAL ABONOS SALDO FINAL",),
    summary_totals_extractor=_extract_copecpay_summary_totals,
    layout_columns=LayoutColumnProfile(
        expense_headers=("CARGOS", "CARGO"),
        income_headers=("ABONOS", "ABONO"),
        balance_headers=("SALDO",),
        description_headers=(
            "DESCRIPCION",
            "DESCRIPCIÓN",
        ),
    ),
)
