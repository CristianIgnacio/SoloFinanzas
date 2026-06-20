from __future__ import annotations

import re


class NormalizationError(ValueError):
    """Indica que un valor no pudo normalizarse de forma segura."""

    pass


def normalize_amount_clp(raw_value: object) -> int:
    """Convierte un monto textual CLP a entero rechazando decimales no cero."""
    if raw_value is None:
        raise NormalizationError("El monto no puede ser nulo.")

    text = str(raw_value).strip()
    if not text:
        raise NormalizationError("El monto no puede estar vacio.")

    sanitized = re.sub(r"\bCLP\b", "", text, flags=re.IGNORECASE)
    sanitized = sanitized.replace("$", "").replace(" ", "").replace("\u00a0", "")
    if not re.search(r"\d", sanitized):
        raise NormalizationError(f"El monto no contiene digitos validos: {text}")

    sign = -1 if sanitized.startswith("-") else 1
    sanitized = sanitized.lstrip("+-")
    decimal_separator = None

    if "," in sanitized and "." in sanitized:
        decimal_separator = "," if sanitized.rfind(",") > sanitized.rfind(".") else "."
    elif "," in sanitized and _has_decimal_part(sanitized, ","):
        decimal_separator = ","
    elif "." in sanitized and _has_decimal_part(sanitized, "."):
        decimal_separator = "."

    if decimal_separator:
        integer_part, decimal_part = sanitized.rsplit(decimal_separator, 1)
        integer_digits = re.sub(r"[.,]", "", integer_part)
        decimal_digits = re.sub(r"[.,]", "", decimal_part)
        if not integer_digits.isdigit() or not decimal_digits.isdigit():
            raise NormalizationError(f"No se pudo interpretar el monto: {text}")
        if int(decimal_digits) != 0:
            raise NormalizationError(
                "El monto contiene decimales distintos de cero y no puede "
                "convertirse de forma segura a CLP entero."
            )
        return sign * int(integer_digits)

    digits_only = re.sub(r"[.,]", "", sanitized)
    if not digits_only.isdigit():
        raise NormalizationError(f"No se pudo interpretar el monto: {text}")
    return sign * int(digits_only)


def normalize_description(raw_value: object) -> str:
    """Normaliza descripciones a minusculas sin puntuacion redundante."""
    if raw_value is None:
        raise NormalizationError("La descripcion no puede ser nula.")

    text = str(raw_value).strip().lower()
    if not text:
        raise NormalizationError("La descripcion no puede estar vacia.")

    text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)
    return re.sub(r"\s+", " ", text.replace("_", " ")).strip()


def _has_decimal_part(value: str, separator: str) -> bool:
    """Detecta si el separador parece marcar decimales y no miles."""
    parts = value.rsplit(separator, 1)
    return len(parts) == 2 and len(parts[1]) in (1, 2)
