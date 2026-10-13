"""Santander Chile national credit-card statement, billed CLP movements."""

from __future__ import annotations

import re
from datetime import datetime

from app.domain.enums import TransactionType
from app.domain.normalizer import normalize_description
from app.schemas.transaction import TransactionCandidate

from ..models import PdfImportError, ParserResult


DATE = re.compile(r"\b\d{2}/\d{2}/\d{4}\b")
MONEY = re.compile(r"\$\s*(-?[\d.]+)")
QUOTA = re.compile(r"\b(\d{2})/(\d{2})\b")


def _clp(raw: str) -> int:
    return int(raw.replace(".", ""))


def _summary_amount(text: str, label: str) -> int:
    matches = re.findall(
        rf"^{re.escape(label)}\s+\$\s*([\d.]+)\s*$",
        text,
        flags=re.MULTILINE | re.IGNORECASE,
    )
    if len(matches) != 1:
        raise PdfImportError(f"No se pudo verificar el resumen: {label}.")
    return _clp(matches[0])


def validate_santander_credit_national(text: str) -> None:
    """Require the national credit layout, not a Santander current-account PDF."""
    required = (
        r"ESTADO DE CUENTA EN MONEDA NACIONAL DE TARJETA DE CR.DITO",
        r"PERIODO FACTURADO\s+\d{2}/\d{2}/\d{4}\s+\d{2}/\d{2}/\d{4}",
        r"MOVIMIENTOS TARJETA",
        r"3\. CARGOS, COMISIONES, IMPUESTOS Y ABONOS",
        r"III\. INFORMACI.N DE PAGO",
    )
    if not all(re.search(pattern, text, re.IGNORECASE) for pattern in required):
        raise PdfImportError(
            "El PDF no corresponde al estado de cuenta nacional de tarjeta de crédito Santander compatible."
        )


def _candidate(line: str, index: int, period_month: str) -> TransactionCandidate | None:
    date_match = DATE.search(line)
    amounts = list(MONEY.finditer(line))
    if date_match is None or not amounts:
        return None
    raw_date = date_match.group()
    try:
        transaction_date = datetime.strptime(raw_date, "%d/%m/%Y").date()
    except ValueError as error:
        raise PdfImportError("Hay una fecha de operación inválida en el estado de cuenta.") from error
    amount = _clp(amounts[-1].group(1))
    details = line[date_match.end():amounts[0].start()].strip()
    if not details or amount == 0:
        raise PdfImportError("Hay una operación sin descripción o monto en el estado de cuenta.")
    if amount < 0 and re.search(r"MONTO CANCELADO|PAGO (?:DE )?TARJETA", details, re.IGNORECASE):
        return None
    quota = QUOTA.search(line[date_match.end():amounts[-1].start()])
    raw_data: dict[str, int | str] = {
        "document_kind": "estado_credito_nacional",
        "billing_period": period_month,
    }
    if quota:
        raw_data.update({
            "quota_number": int(quota.group(1)),
            "quota_count": int(quota.group(2)),
            "purchase_amount_clp": _clp(amounts[0].group(1)),
        })
        details = re.split(r"\s+(?:TRES CUOTAS|CUOTAS? FIJAS?|\d{2} CUOTAS)\b", details, maxsplit=1, flags=re.IGNORECASE)[0]
        details = f"{details} (cuota {int(quota.group(1))}/{int(quota.group(2))})"
    return TransactionCandidate(
        source_id=f"santander-credit-{index:06d}",
        source_line=line,
        date=transaction_date,
        description=details,
        normalized_description=normalize_description(details),
        amount_clp=-amount,
        transaction_type=TransactionType.EXPENSE if amount > 0 else TransactionType.INCOME,
        raw_data=raw_data,
    )


def parse_santander_credit_national(
    text: str,
    *,
    layout_lines=(),
    vertical_edges=(),
    validation_warnings: list[str] | None = None,
) -> ParserResult:
    """Import only billed operations and fees; exclude payments and future quotas."""
    validate_santander_credit_national(text)
    period = re.search(
        r"PERIODO FACTURADO\s+\d{2}/\d{2}/\d{4}\s+(\d{2}/\d{2}/\d{4})",
        text,
        re.IGNORECASE,
    )
    if period is None:
        raise PdfImportError("No se encontró el período facturado.")
    period_month = datetime.strptime(period.group(1), "%d/%m/%Y").strftime("%Y-%m")
    operation_total = _summary_amount(text, "1. TOTAL OPERACIONES")
    charges_total = _summary_amount(text, "3. CARGOS, COMISIONES, IMPUESTOS Y ABONOS")
    billed_total = _summary_amount(text, "MONTO TOTAL FACTURADO A PAGAR")

    section = ""
    seen_movements = False
    candidates: list[TransactionCandidate] = []
    operation_sum = 0
    charges_sum = 0
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("MOVIMIENTOS TARJETA"):
            seen_movements = True
            section = "operations"
            continue
        if seen_movements and line.startswith("2. PERIODO ACTUAL"):
            section = "operations"
            continue
        if line.startswith("EMISOR CLIENTE"):
            section = ""
            continue
        if line.startswith("2. PRODUCTOS O SERVICIOS"):
            section = ""
            continue
        if line.startswith("3. CARGOS, COMISIONES, IMPUESTOS Y ABONOS"):
            section = "charges"
            continue
        if line.startswith("4. INFORMACION COMPRAS EN CUOTAS"):
            section = ""
            continue
        if section not in {"operations", "charges"} or DATE.search(line) is None:
            continue
        candidate = _candidate(line, len(candidates) + 1, period_month)
        if candidate is None:
            continue
        candidates.append(candidate)
        if section == "operations":
            operation_sum -= candidate.amount_clp
        else:
            charges_sum -= candidate.amount_clp

    if operation_sum != operation_total or charges_sum != charges_total or operation_total + charges_total != billed_total:
        if validation_warnings is None:
            raise PdfImportError("Los movimientos del estado de cuenta Santander no cuadran con sus totales.")
        validation_warnings.append("Los movimientos detectados no cuadran con el total del estado de cuenta Santander.")
    return candidates, [], period_month
