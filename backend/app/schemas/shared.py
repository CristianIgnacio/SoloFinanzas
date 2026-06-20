from __future__ import annotations

from sqlmodel import SQLModel


class ImportTransactionsResult(SQLModel):
    statement_id: int
    inserted_count: int
    omitted_internal_count: int
    omitted_existing_count: int

    @property
    def omitted_count(self) -> int:
        """Calcula el total de movimientos omitidos durante una importacion."""
        return self.omitted_internal_count + self.omitted_existing_count
