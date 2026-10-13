from __future__ import annotations

from ..models import LayoutColumnProfile, TabularParserProfile
from ..tabular import (
    STANDARD_DESDE_HASTA_PERIOD_PATTERNS,
    MERCADOPAGO_POSITIONAL_PERIOD_PATTERNS,
    _normalize_mercadopago_description,
)

MERCADOPAGO_PROFILE = TabularParserProfile(
    display_name="Mercado Pago",
    document_markers=("MERCADO PAGO", "MERCADOPAGO"),
    period_patterns=(
        *STANDARD_DESDE_HASTA_PERIOD_PATTERNS,
        *MERCADOPAGO_POSITIONAL_PERIOD_PATTERNS,
    ),
    income_keywords=(
        "ABONO",
        "DINERO RECIBIDO",
        "PAGO RECIBIDO",
        "COBRO",
        "VENTA",
        "INGRESO",
        "DEVOLUCION",
        "RENDIMIENTO",
    ),
    expense_keywords=(
        "COMPRA",
        "PAGO",
        "RETIRO",
        "COMISION",
        "TRANSFERENCIA ENVIADA",
        "DINERO ENVIADO",
        "CARGO",
    ),
    movement_start_markers=("FECHA DE ACREDITACI",),
    description_normalizer=_normalize_mercadopago_description,
    layout_columns=LayoutColumnProfile(
        expense_headers=("EGRESO", "EGRESOS", "CARGO", "CARGOS"),
        income_headers=("INGRESO", "INGRESOS", "ABONO", "ABONOS"),
        balance_headers=("SALDO",),
        description_headers=(
            "DESCRIPCION",
            "DESCRIPCIÓN",
            "DETALLE",
            "MOVIMIENTO",
            "OPERACION",
            "OPERACIÓN",
        ),
    ),
)
