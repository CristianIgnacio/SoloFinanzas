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


class StatementCreate(StatementBase):
    pass


class Statement(StatementBase):
    id: int
    uploaded_at: datetime


class StatementDeletionImpact(SQLModel):
    statement_id: int
    transaction_count: int
    income_total_clp: int
    expense_total_clp: int
    net_total_clp: int
    affected_periods: list[str]
    internal_transfer_match_count: int
    raw_file_delete_eligible: bool


class StatementDeletionResult(StatementDeletionImpact):
    raw_file_deleted: bool


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
