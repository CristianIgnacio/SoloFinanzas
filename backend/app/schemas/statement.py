from __future__ import annotations

from datetime import datetime

from sqlmodel import Field, SQLModel

from app.domain.enums import StatementStatus
from app.domain.parsers import ParserKey
from app.schemas.shared import ImportTransactionsResult
from app.schemas.transaction import TransactionPreviewCandidate


class StatementBase(SQLModel):
    account_id: int
    file_name: str
    file_type: str
    file_checksum: str | None = Field(default=None)
    period_month: str | None = Field(default=None)
    status: StatementStatus = StatementStatus.PENDING
    raw_path: str | None = Field(default=None)


class StatementCreate(StatementBase):
    pass


class Statement(StatementBase):
    id: int
    uploaded_at: datetime


class PdfPreview(SQLModel):
    parser_key: ParserKey
    file_name: str
    file_checksum: str
    page_count: int
    is_encrypted: bool
    used_password: bool
    preview_lines: list[str]
    extracted_text_length: int
    period_month: str
    candidate_transactions: list[TransactionPreviewCandidate]
    parsing_errors: list[str]


class PdfImportResponse(SQLModel):
    statement: Statement
    result: ImportTransactionsResult
