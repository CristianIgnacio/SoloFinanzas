from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass

from app.schemas.transaction import TransactionCandidate


class PdfImportError(ValueError):
    """Indica que un PDF no pudo validarse, leerse o parsearse."""

    pass


class PublicPdfError(PdfImportError):
    """A safe, coded PDF error that may be shown to the account owner."""

    def __init__(self, code: str, message: str, action: str = "") -> None:
        super().__init__(message)
        self.code = code
        self.action = action


ParserResult = tuple[list[TransactionCandidate], list[str], str]
ParserHandler = Callable[..., ParserResult]
DocumentValidator = Callable[[str], None]
SummaryTotalsExtractor = Callable[[str], tuple[int, int] | None]
DescriptionNormalizer = Callable[[str], str]


@dataclass(frozen=True)
class LayoutWord:
    text: str
    x0: float
    x1: float
    top: float
    bottom: float


@dataclass(frozen=True)
class LayoutLine:
    text: str
    page_index: int
    top: float
    words: tuple[LayoutWord, ...]


@dataclass(frozen=True)
class LayoutVerticalEdge:
    page_index: int
    x: float
    top: float
    bottom: float


@dataclass(frozen=True)
class PdfContent:
    text: str
    layout_lines: tuple[LayoutLine, ...]
    vertical_edges: tuple[LayoutVerticalEdge, ...] = ()


@dataclass(frozen=True)
class LayoutColumnProfile:
    expense_headers: tuple[str, ...]
    income_headers: tuple[str, ...]
    balance_headers: tuple[str, ...]
    description_headers: tuple[str, ...] = ("DESCRIPCION", "DESCRIPCIÃ“N")


@dataclass(frozen=True)
class LayoutColumnRanges:
    expense: tuple[float, float]
    income: tuple[float, float]
    balance: tuple[float, float]


@dataclass(frozen=True)
class TabularParserProfile:
    display_name: str
    document_markers: tuple[str, ...]
    period_patterns: tuple[re.Pattern[str], ...]
    income_keywords: tuple[str, ...]
    expense_keywords: tuple[str, ...]
    continuation_lines: bool = False
    movement_start_markers: tuple[str, ...] = ()
    movement_end_markers: tuple[str, ...] = ()
    summary_totals_extractor: SummaryTotalsExtractor | None = None
    layout_columns: LayoutColumnProfile | None = None
    description_normalizer: DescriptionNormalizer | None = None
    movement_columns_pattern: re.Pattern[str] | None = None
    period_from_transactions: bool = False


@dataclass(frozen=True)
class TabularLine:
    text: str
    layout_line: LayoutLine | None = None
