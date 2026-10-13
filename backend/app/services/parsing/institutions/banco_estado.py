from __future__ import annotations

from ..models import TabularParserProfile
from ..tabular import STANDARD_DESDE_HASTA_PERIOD_PATTERNS

BANCO_ESTADO_PROFILE = TabularParserProfile(
    display_name="BancoEstado",
    document_markers=("BANCOESTADO", "BANCO ESTADO", "CUENTARUT"),
    period_patterns=STANDARD_DESDE_HASTA_PERIOD_PATTERNS,
    income_keywords=(
        "ABONO",
        "DEPOSITO",
        "TRANSFERENCIA RECIBIDA",
        "REMUNERACION",
        "PAGO RECIBIDO",
    ),
    expense_keywords=(
        "CARGO",
        "COMPRA",
        "PAGO",
        "GIRO",
        "COMISION",
        "TRANSFERENCIA ENVIADA",
        "PAC",
    ),
)
