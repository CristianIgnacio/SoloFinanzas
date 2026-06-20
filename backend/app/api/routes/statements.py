import json
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import ValidationError
from sqlmodel import Session

from app.core.database import get_session
from app.domain.enums import StatementStatus
from app.models.account import AccountModel
from app.schemas.statement import PdfImportResponse, PdfPreview, Statement, StatementCreate
from app.schemas.transaction import TransactionCandidateReview
from app.services.pdf_importer import PdfImportError, inspect_pdf, save_raw_pdf
from app.services.statements import (
    DuplicateStatementError,
    apply_transaction_reviews,
    build_transaction_previews,
    create_statement,
    get_statement,
    import_pdf_transactions,
    list_statements,
    update_statement_status,
)

router = APIRouter()
SessionDep = Annotated[Session, Depends(get_session)]


async def _read_pdf(file: UploadFile) -> tuple[str, bytes]:
    """Lee un UploadFile PDF y conserva un nombre seguro por defecto."""
    file_name = file.filename or "cartola.pdf"
    file_bytes = await file.read()
    return file_name, file_bytes


@router.get("/statements", response_model=list[Statement])
def get_statements(
    session: SessionDep,
    account_id: int | None = None,
) -> list[Statement]:
    """Devuelve cartolas, opcionalmente filtradas por cuenta."""
    return list_statements(session, account_id=account_id)


@router.get("/statements/{statement_id}", response_model=Statement)
def get_statement_detail(statement_id: int, session: SessionDep) -> Statement:
    """Devuelve una cartola especifica."""
    statement = get_statement(session, statement_id)
    if not statement:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Statement not found")
    return statement


@router.post("/statements", response_model=Statement, status_code=status.HTTP_201_CREATED)
def post_statement(payload: StatementCreate, session: SessionDep) -> Statement:
    """Crea una cartola manual."""
    return create_statement(session, payload)


@router.patch("/statements/{statement_id}/status", response_model=Statement)
def patch_statement_status(
    statement_id: int,
    status: StatementStatus,
    session: SessionDep,
) -> Statement:
    """Actualiza el estado de una cartola."""
    statement = update_statement_status(session, statement_id, status.value)
    if not statement:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Statement not found")
    return statement


@router.post("/statement-imports/pdf/preview", response_model=PdfPreview)
async def preview_pdf_statement(
    session: SessionDep,
    account_id: Annotated[int, Form()],
    file: Annotated[UploadFile, File()],
    password: Annotated[str | None, Form()] = None,
) -> PdfPreview:
    """Previsualiza un PDF sin persistir la cartola ni sus movimientos."""
    account = session.get(AccountModel, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="La cuenta seleccionada no existe.")
    file_name, file_bytes = await _read_pdf(file)
    try:
        preview = inspect_pdf(
            file_name=file_name,
            file_bytes=file_bytes,
            institution=account.institution,
            password=password or None,
        )
        return preview.model_copy(
            update={
                "candidate_transactions": build_transaction_previews(
                    session,
                    preview.candidate_transactions,
                )
            }
        )
    except PdfImportError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post(
    "/statement-imports/pdf",
    response_model=PdfImportResponse,
    status_code=status.HTTP_201_CREATED,
)
async def import_pdf_statement(
    session: SessionDep,
    account_id: Annotated[int, Form()],
    file: Annotated[UploadFile, File()],
    password: Annotated[str | None, Form()] = None,
) -> PdfImportResponse:
    """Importa una cartola PDF y persiste sus movimientos detectados."""
    account = session.get(AccountModel, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="La cuenta seleccionada no existe.")
    file_name, file_bytes = await _read_pdf(file)
    try:
        preview = inspect_pdf(
            file_name=file_name,
            file_bytes=file_bytes,
            institution=account.institution,
            password=password or None,
        )
        raw_path = save_raw_pdf(file_name, file_bytes, preview.file_checksum)
        return import_pdf_transactions(
            session,
            account_id=account_id,
            file_name=file_name,
            file_checksum=preview.file_checksum,
            raw_path=raw_path,
            period_month=preview.period_month,
            candidates=preview.candidate_transactions,
        )
    except DuplicateStatementError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except (PdfImportError, ValueError) as error:
        session.rollback()
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post(
    "/statement-imports/pdf/reviewed",
    response_model=PdfImportResponse,
    status_code=status.HTTP_201_CREATED,
)
async def import_reviewed_pdf_statement(
    session: SessionDep,
    account_id: Annotated[int, Form()],
    file: Annotated[UploadFile, File()],
    reviewed_transactions: Annotated[str, Form()],
    password: Annotated[str | None, Form()] = None,
) -> PdfImportResponse:
    """Importa una cartola usando tipo/categoria revisados en la preview."""
    account = session.get(AccountModel, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="La cuenta seleccionada no existe.")
    file_name, file_bytes = await _read_pdf(file)
    try:
        reviews = _parse_reviewed_transactions(reviewed_transactions)
        preview = inspect_pdf(
            file_name=file_name,
            file_bytes=file_bytes,
            institution=account.institution,
            password=password or None,
        )
        reviewed_candidates, category_overrides = apply_transaction_reviews(
            session,
            preview.candidate_transactions,
            reviews,
        )
        raw_path = save_raw_pdf(file_name, file_bytes, preview.file_checksum)
        return import_pdf_transactions(
            session,
            account_id=account_id,
            file_name=file_name,
            file_checksum=preview.file_checksum,
            raw_path=raw_path,
            period_month=preview.period_month,
            candidates=reviewed_candidates,
            category_overrides=category_overrides,
        )
    except DuplicateStatementError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except (PdfImportError, ValueError, ValidationError) as error:
        session.rollback()
        raise HTTPException(status_code=422, detail=str(error)) from error


def _parse_reviewed_transactions(payload: str) -> list[TransactionCandidateReview]:
    """Parsea el JSON enviado por multipart/form-data."""
    try:
        raw_items = json.loads(payload)
    except json.JSONDecodeError as error:
        raise ValueError("Las revisiones enviadas no tienen formato JSON valido.") from error
    if not isinstance(raw_items, list):
        raise ValueError("Las revisiones deben enviarse como una lista.")
    return [TransactionCandidateReview.model_validate(item) for item in raw_items]
