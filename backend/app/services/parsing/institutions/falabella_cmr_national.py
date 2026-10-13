"""Estado de cuenta CMR nacional: cargos facturados en pesos, sin pagos repetidos."""

from __future__ import annotations

import re
from datetime import datetime

from app.domain.enums import TransactionType
from app.domain.normalizer import normalize_description
from app.schemas.transaction import TransactionCandidate

from ..models import PdfImportError, ParserResult


DATE = r"\d{2}/\d{2}/\d{4}"
MONEY = r"-?[\d.]+"
OPERATION = re.compile(
    rf"^(?:(?P<place>.*?)\s+)?(?P<date>{DATE})\s+"
    rf"(?P<description>.+?)\s+(?:(?P<card>T|A)\s+)?"
    rf"(?P<operation>{MONEY})\s+(?P<total>{MONEY})\s+"
    rf"(?P<quota>\d{{2}}/\d{{2}})\s+(?P<first_charge>\S+)\s+"
    rf"(?P<monthly>{MONEY})$",
    re.IGNORECASE,
)
CHARGE = re.compile(
    rf"^(?:(?P<place>.*?)\s+)?(?P<date>{DATE})\s+"
    rf"(?P<description>.+?)\s+(?:(?P<card>T|A)\s+)?"
    rf"(?P<operation>{MONEY})\s+(?P<total>{MONEY})\s+"
    rf"(?P<monthly>{MONEY})$",
    re.IGNORECASE,
)
DATED_ROW = re.compile(rf"\b{DATE}\b")
LAST4 = re.compile(r"\(1\)\s*T:\s*Titular\s*:\s*\d{0,10}[*Xx•]{2,}\s*(\d{4})", re.IGNORECASE)


def _clp(raw: str) -> int:
    return int(raw.replace(".", ""))


def _clp_label(amount: int) -> str:
    return f"${amount:,}".replace(",", ".")


def _one_amount(text: str, label: str) -> int:
    values = re.findall(rf"^{label}\s+\$?\s*({MONEY})\s*$", text, re.MULTILINE | re.IGNORECASE)
    if len(values) != 1:
        raise PdfImportError(f"No se pudo verificar el resumen {label} del estado CMR.")
    return _clp(values[0])


def validate_falabella_cmr_national(text: str) -> None:
    required = (
        r"ESTADO DE CUENTA",
        r"CLIENTE CMR",
        r"N.\s+de Contrato",
        rf"Per.odo Facturado\s+{DATE}\s+{DATE}",
        r"2\.\s*PER.ODO ACTUAL",
        r"COMPRAS NACIONALES",
        r"2\.3\s+Cargos, Comisiones, Impuestos y Abonos",
        r"III\.\s*INFORMACI.N DE PAGO",
    )
    if not all(re.search(marker, text, re.IGNORECASE) for marker in required):
        raise PdfImportError("El PDF no corresponde al estado de cuenta nacional CMR compatible.")


def extract_falabella_cmr_last4(text: str) -> str | None:
    match = LAST4.search(text)
    return match.group(1) if match else None


def parse_falabella_cmr_national(
    text: str,
    *,
    layout_lines=(),
    vertical_edges=(),
    validation_warnings: list[str] | None = None,
) -> ParserResult:
    """Importa compras y cargos facturados; excluye pagos y vencimientos futuros."""
    validate_falabella_cmr_national(text)
    period = re.search(rf"Per.odo Facturado\s+{DATE}\s+({DATE})", text, re.IGNORECASE)
    if period is None:
        raise PdfImportError("No se encontró el período facturado CMR.")
    try:
        period_month = datetime.strptime(period.group(1), "%d/%m/%Y").strftime("%Y-%m")
    except ValueError as error:
        raise PdfImportError("El período facturado CMR contiene una fecha inválida.") from error

    previous_balance = _one_amount(text, r"Saldo adeudado final periodo anterior")
    billed_total = _one_amount(text, r"Monto Total Facturado a Pagar")
    candidates: list[TransactionCandidate] = []
    parsing_errors: list[str] = []
    current_section = ""

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if re.match(r"^2\.1\s+Total Operaciones", line, re.IGNORECASE):
            current_section = "operations"
            continue
        if re.match(r"^2\.2\s+Productos o servicios", line, re.IGNORECASE):
            current_section = "products"
            continue
        if re.match(r"^2\.3\s+Cargos, Comisiones", line, re.IGNORECASE):
            current_section = "charges"
            continue
        if re.match(r"^III\.\s*INFORMACI", line, re.IGNORECASE):
            break
        if current_section not in {"operations", "products", "charges"} or not DATED_ROW.search(line):
            continue
        if re.match(r"^Fecha Facturaci.n Estado de", line, re.IGNORECASE):
            continue
        if current_section == "charges" and re.search(r"\bPago\s+(?:de\s+)?tarjeta\s+cmr\b", line, re.IGNORECASE):
            continue

        match = OPERATION.match(line) if current_section == "operations" else CHARGE.match(line)
        if match is None:
            parsing_errors.append(line)
            continue
        description = match.group("description").strip()
        amount = _clp(match.group("monthly"))
        if not description or amount == 0:
            parsing_errors.append(line)
            continue
        try:
            date = datetime.strptime(match.group("date"), "%d/%m/%Y").date()
        except ValueError:
            parsing_errors.append(line)
            continue

        raw_data: dict[str, int | str] = {
            "document_kind": "estado_credito_nacional",
            "billing_period": period_month,
            "charge_group": current_section,
            "operation_amount_clp": _clp(match.group("operation")),
            "total_payable_clp": _clp(match.group("total")),
        }
        if current_section == "operations":
            quota_number, quota_count = map(int, match.group("quota").split("/"))
            if not 1 <= quota_number <= quota_count:
                parsing_errors.append(line)
                continue
            raw_data.update({
                "quota_number": quota_number,
                "quota_count": quota_count,
                "first_charge": match.group("first_charge"),
            })
            if quota_count > 1:
                description += f" (cuota {quota_number}/{quota_count})"
        candidates.append(TransactionCandidate(
            source_id=f"falabella-cmr-{len(candidates) + 1:06d}",
            source_line=line,
            date=date,
            description=description,
            normalized_description=normalize_description(description),
            amount_clp=-amount,
            transaction_type=TransactionType.EXPENSE if amount > 0 else TransactionType.INCOME,
            raw_data=raw_data,
        ))

    charges_total = sum(-item.amount_clp for item in candidates)
    calculated_total = previous_balance + charges_total
    if calculated_total != billed_total:
        discrepancy = abs(calculated_total - billed_total)
        message = (
            f"El total facturado CMR es {_clp_label(billed_total)}, pero el saldo anterior "
            f"({_clp_label(previous_balance)}) más los cargos detectados "
            f"({_clp_label(charges_total)}) suma {_clp_label(calculated_total)}. "
            f"Diferencia: {_clp_label(discrepancy)}."
        )
        if validation_warnings is None:
            raise PdfImportError(message)
        validation_warnings.append(message)
    return candidates, parsing_errors, period_month
