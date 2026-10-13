"""Banco de Chile national credit statement: current billed CLP charges."""

from __future__ import annotations

import re
from datetime import datetime

from app.domain.enums import TransactionType
from app.domain.normalizer import normalize_description
from app.schemas.transaction import TransactionCandidate

from ..models import PdfImportError, ParserResult


MONEY = r"-?[\d.]+"
MOVEMENT = re.compile(
    rf"^(?:.*?)\b(?P<date>\d{{2}}/\d{{2}}/\d{{2}})\s+"
    rf"(?P<reference>\d{{10,14}})\s+(?P<description>.+?)\s+"
    rf"\$\s*(?P<operation>{MONEY})\s+\$\s*(?P<payable>{MONEY})\s+"
    rf"(?P<quota>\d{{2}}/\d{{2}})\s+\$\s*(?P<monthly>{MONEY})\s*$"
)
REFERENCE_ROW = re.compile(r"\b\d{2}/\d{2}/\d{2}\s+\d{10,14}\b")
SUMMARY_LABELS = {
    "A": r"MONTO FACTURADO A PAGAR\s*\([^)]*ANTERIOR\)",
    "B": r"TOTAL PAGOS A LA CUENTA",
    "C": r"TOTAL PAT A LA CUENTA",
    "D": r"TOTAL TRANSACCIONES EN UNA CUOTA",
    "E": r"TOTAL TRANSACCIONES EN CUOTAS",
    "F": r"TOTAL PRODUCTOS O SERVICIOS VOLUNTARIAMENTE CONTRATADOS",
    "G": r"TOTAL CARGOS, COMISIONES, IMPUESTOS Y ABONOS",
}


def _clp(raw: str) -> int:
    return int(raw.replace(".", ""))


def _summary(text: str, group: str) -> int:
    matches = re.findall(
        rf"^{SUMMARY_LABELS[group]}\s+{group}\s+\$\s*({MONEY})\b",
        text,
        re.MULTILINE | re.IGNORECASE,
    )
    if len(matches) != 1:
        raise PdfImportError(f"No se pudo verificar el subtotal {group} del estado de cuenta Banco de Chile.")
    return _clp(matches[0])


def validate_banco_chile_credit_national(text: str) -> None:
    required = (
        r"ESTADO DE CUENTA NACIONAL DE TARJETA DE CR.DITO",
        r"N. DE TARJETA DE CR.DITO\s+.*\d{4}",
        r"PER.ODO FACTURADO\s+\d{2}/\d{2}/\d{4}\s+\d{2}/\d{2}/\d{4}",
        r"TOTAL TRANSACCIONES EN UNA CUOTA\s+D\s+\$",
        r"TOTAL TRANSACCIONES EN CUOTAS\s+E\s+\$",
        r"III\. INFORMACI.N DE PAGO",
    )
    if not all(re.search(marker, text, re.IGNORECASE) for marker in required):
        raise PdfImportError(
            "El PDF no corresponde al estado de cuenta nacional de tarjeta Banco de Chile compatible."
        )


def extract_banco_chile_credit_last4(text: str) -> str | None:
    match = re.search(r"^N. DE TARJETA DE CR.DITO\s+[^\n]*?(\d{4})\s*$", text, re.MULTILINE)
    return match.group(1) if match else None


def parse_banco_chile_credit_national(
    text: str,
    *,
    layout_lines=(),
    vertical_edges=(),
    validation_warnings: list[str] | None = None,
) -> ParserResult:
    """Skip prior debt and payments; import only billed D/E/F/G movements."""
    validate_banco_chile_credit_national(text)
    period = re.search(
        r"PER.ODO FACTURADO\s+\d{2}/\d{2}/\d{4}\s+(\d{2}/\d{2}/\d{4})",
        text,
        re.IGNORECASE,
    )
    if period is None:
        raise PdfImportError("No se encontró el período facturado Banco de Chile.")
    try:
        period_month = datetime.strptime(period.group(1), "%d/%m/%Y").strftime("%Y-%m")
    except ValueError as error:
        raise PdfImportError("El período facturado Banco de Chile contiene una fecha inválida.") from error

    summaries = {group: _summary(text, group) for group in SUMMARY_LABELS}
    total_match = re.search(
        rf"^MONTO TOTAL FACTURADO A PAGAR\s*\([^\n)]*A\+B\+C\+D\+E\+F\+G\s*\)\s*\$\s*({MONEY})\b",
        text,
        re.MULTILINE | re.IGNORECASE,
    )
    total_disagrees = total_match is None or sum(summaries.values()) != _clp(total_match.group(1))

    group = ""
    amounts = {key: 0 for key in "DEFG"}
    candidates: list[TransactionCandidate] = []
    for original in text.splitlines():
        line = original.strip()
        if line.startswith("III. INFORMACI"):
            break
        for key in "BCDEFG":
            if re.search(rf"^{SUMMARY_LABELS[key]}\s+{key}\s+\$", line, re.IGNORECASE):
                group = {"B": "C", "C": "D", "D": "E", "E": "F", "F": "G", "G": ""}[key]
                break
        else:
            if group not in amounts or not REFERENCE_ROW.search(line):
                continue
            match = MOVEMENT.match(line)
            if match is None:
                raise PdfImportError("Hay una operación Banco de Chile cuyo formato no se pudo leer.")
            try:
                date = datetime.strptime(match.group("date"), "%d/%m/%y").date()
            except ValueError as error:
                raise PdfImportError("Hay una fecha de operación inválida en el estado de cuenta.") from error
            amount = _clp(match.group("monthly"))
            if amount == 0 or not match.group("description").strip():
                raise PdfImportError("Hay una operación sin descripción o monto en el estado de cuenta.")
            quota_number, quota_count = map(int, match.group("quota").split("/"))
            if not 1 <= quota_number <= quota_count:
                raise PdfImportError("Hay una cuota inválida en el estado de cuenta.")
            description = match.group("description").strip()
            if quota_count > 1:
                description += f" (cuota {quota_number}/{quota_count})"
            raw_data: dict[str, int | str] = {
                "document_kind": "estado_credito_nacional",
                "billing_period": period_month,
                "charge_group": group,
                "reference": match.group("reference"),
                "operation_amount_clp": _clp(match.group("operation")),
                "payable_amount_clp": _clp(match.group("payable")),
                "quota_number": quota_number,
                "quota_count": quota_count,
            }
            candidates.append(TransactionCandidate(
                source_id=f"banco-chile-credit-{len(candidates) + 1:06d}",
                source_line=line,
                date=date,
                description=description,
                normalized_description=normalize_description(description),
                amount_clp=-amount,
                transaction_type=TransactionType.EXPENSE if amount > 0 else TransactionType.INCOME,
                raw_data=raw_data,
            ))
            amounts[group] += amount

    if total_disagrees or any(amounts[key] != summaries[key] for key in amounts):
        if validation_warnings is None:
            raise PdfImportError("Los cargos del estado de cuenta Banco de Chile no cuadran con sus totales.")
        validation_warnings.append("Los cargos detectados no cuadran con los totales del estado de cuenta Banco de Chile.")
    return candidates, [], period_month
