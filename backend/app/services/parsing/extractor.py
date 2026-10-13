from __future__ import annotations

import re
from io import BytesIO
import pdfplumber
from pypdf import PdfReader
from .models import PdfImportError, PublicPdfError, PdfContent, LayoutWord, LayoutLine, LayoutVerticalEdge

def _build_reader(
    file_bytes: bytes,
    password: str | None,
) -> tuple[PdfReader, bool]:
    """Construye un lector PDF validando apertura y contrasena si aplica."""
    try:
        reader = PdfReader(BytesIO(file_bytes))
    except Exception as error:
        raise PublicPdfError("INVALID_PDF", "No se pudo abrir el PDF.", "Selecciona un archivo PDF válido.") from error

    requires_password = False
    if reader.is_encrypted:
        try:
            opens_with_empty_password = reader.decrypt("") != 0
        except Exception:
            opens_with_empty_password = False

        if opens_with_empty_password:
            return reader, False

        requires_password = True
        if not password:
            raise PublicPdfError("PASSWORD_REQUIRED", "El PDF está protegido.", "Ingresa su contraseña y vuelve a analizarlo.")
        try:
            if reader.decrypt(password) == 0:
                raise PublicPdfError("PASSWORD_INVALID", "La contraseña del PDF es incorrecta.", "Corrígela y vuelve a analizarlo.")
        except PdfImportError:
            raise
        except Exception as error:
            raise PdfImportError("No se pudo validar la contrasena del PDF.") from error
    return reader, requires_password


def _extract_pdf_content(file_bytes: bytes, password: str | None) -> PdfContent:
    """Extrae texto, palabras posicionadas y bordes desde un PDF en una pasada."""
    try:
        with pdfplumber.open(BytesIO(file_bytes), password=password) as pdf:
            page_texts: list[str] = []
            layout_lines: list[LayoutLine] = []
            vertical_edges: list[LayoutVerticalEdge] = []
            for page_index, page in enumerate(pdf.pages):
                page_texts.append(page.extract_text() or "")
                layout_lines.extend(_extract_layout_lines(page, page_index))
                vertical_edges.extend(_extract_vertical_edges(page, page_index))
            return PdfContent(
                text="\n".join(page_texts).strip(),
                layout_lines=tuple(layout_lines),
                vertical_edges=tuple(vertical_edges),
            )
    except Exception as error:
        raise PdfImportError(f"No se pudo extraer texto del PDF: {error}") from error


def _extract_vertical_edges(page, page_index: int) -> list[LayoutVerticalEdge]:
    """Conserva divisiones verticales de lineas, rectangulos y otros trazos PDF."""
    return [
        LayoutVerticalEdge(
            page_index=page_index,
            x=(float(edge["x0"]) + float(edge["x1"])) / 2,
            top=float(edge["top"]),
            bottom=float(edge["bottom"]),
        )
        for edge in page.edges
        if abs(edge["x0"] - edge["x1"]) <= 1
        and edge["bottom"] > edge["top"]
    ]


def _extract_layout_lines(page, page_index: int) -> list[LayoutLine]:
    """Agrupa palabras de pdfplumber en lineas visuales conservando coordenadas."""
    raw_words = page.extract_words(
        use_text_flow=False,
        keep_blank_chars=False,
        x_tolerance=2,
        y_tolerance=3,
    )
    sorted_words = sorted(raw_words, key=lambda word: (word["top"], word["x0"]))
    grouped_words: list[list[LayoutWord]] = []

    for raw_word in sorted_words:
        word = LayoutWord(
            text=str(raw_word["text"]),
            x0=float(raw_word["x0"]),
            x1=float(raw_word["x1"]),
            top=float(raw_word["top"]),
            bottom=float(raw_word["bottom"]),
        )
        if not grouped_words or abs(grouped_words[-1][0].top - word.top) > 3:
            grouped_words.append([word])
        else:
            grouped_words[-1].append(word)

    lines: list[LayoutLine] = []
    for words in grouped_words:
        ordered_words = tuple(sorted(words, key=lambda word: word.x0))
        text = " ".join(word.text for word in ordered_words)
        lines.append(
            LayoutLine(
                text=re.sub(r"\s+", " ", text).strip(),
                page_index=page_index,
                top=min(word.top for word in ordered_words),
                words=ordered_words,
            )
        )
    return lines


def _build_preview_lines(extracted_text: str, limit: int) -> list[str]:
    """Construye lineas limpias para mostrar en la previsualizacion."""
    lines: list[str] = []
    for raw_line in extracted_text.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if line:
            lines.append(line)
        if len(lines) >= limit:
            break
    return lines
