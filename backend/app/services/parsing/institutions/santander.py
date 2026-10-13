from __future__ import annotations

from ..models import LayoutColumnProfile, TabularParserProfile
from ..tabular import (
    STANDARD_DESDE_HASTA_PERIOD_PATTERNS,
    SANTANDER_POSITIONAL_PERIOD_PATTERNS,
    _extract_santander_summary_totals,
    _normalize_santander_description,
)

SANTANDER_PROFILE = TabularParserProfile(
    display_name="Banco Santander",
    document_markers=("BANCO SANTANDER", "SANTANDER CHILE", "SANTANDER"),
    period_patterns=(
        *STANDARD_DESDE_HASTA_PERIOD_PATTERNS,
        *SANTANDER_POSITIONAL_PERIOD_PATTERNS,
    ),
    income_keywords=(
        "ABONO",
        "DEPOSITO",
        "TRANSFERENCIA RECIBIDA",
        "TRASPASO RECIBIDO",
        "REMUNERACION",
        "PAGO RECIBIDO",
        "TRANSF.",
    ),
    expense_keywords=(
        "CARGO",
        "COMPRA",
        "PAGO",
        "GIRO",
        "COMISION",
        "TRANSFERENCIA ENVIADA",
        "TRANSF A ",
        "PAC",
        "PAT",
    ),
    continuation_lines=True,
    movement_start_markers=(
        "MOVIMIENTO DE SU CUENTA",
        "CARGOS ABONOS",
        "CARGOS Y ABONOS",
        "CARGO ABONO",
        "CARGO Y ABONO",
    ),
    movement_end_markers=("MENSAJES", "RESUMEN DE COMISIONES"),
    summary_totals_extractor=_extract_santander_summary_totals,
    layout_columns=LayoutColumnProfile(
        expense_headers=("CHEQUES", "CARGOS"),
        income_headers=("DEPOSITOS", "DEPÓSITOS", "ABONOS"),
        balance_headers=("SALDO",),
    ),
    description_normalizer=_normalize_santander_description,
)
