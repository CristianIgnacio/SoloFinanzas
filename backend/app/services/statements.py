import hashlib
import logging
from collections import Counter
from pathlib import Path

from sqlalchemy import func, or_
from sqlmodel import Session, select

from app.domain.enums import (
    CategorySource,
    CategoryType,
    StatementStatus,
    TransactionType,
)
from app.models.account import AccountModel
from app.models.category import CategoryModel
from app.models.categorization_rule import CategorizationRuleModel
from app.models.internal_transfer_match import InternalTransferMatchModel
from app.models.statement import StatementModel
from app.models.transaction import TransactionModel
from app.domain.normalizer import normalize_description
from app.schemas.shared import ImportTransactionsResult
from app.schemas.statement import (
    PdfImportResponse,
    Statement,
    StatementCreate,
    StatementDeletionImpact,
    StatementDeletionResult,
)
from app.schemas.transaction import TransactionCandidate
from app.schemas.transaction import (
    TransactionCandidateReview,
    TransactionPreviewCandidate,
)
from app.services.internal_transfers import refresh_internal_transfer_matches


logger = logging.getLogger(__name__)
BACKEND_DIR = Path(__file__).resolve().parents[2]
RAW_DIR = BACKEND_DIR / "data" / "raw"


def create_statement(session: Session, payload: StatementCreate) -> Statement:
    """Crea una cartola registrada manualmente."""
    statement = StatementModel(
        account_id=payload.account_id,
        file_name=payload.file_name,
        file_type=payload.file_type,
        file_checksum=payload.file_checksum,
        period_month=payload.period_month,
        status=payload.status,
        raw_path=payload.raw_path,
    )
    session.add(statement)
    session.commit()
    session.refresh(statement)
    return Statement.model_validate(statement)


def list_statements(session: Session, account_id: int | None = None) -> list[Statement]:
    """Lista cartolas, opcionalmente filtradas por cuenta."""
    query = select(StatementModel).order_by(
        StatementModel.uploaded_at.desc(), StatementModel.id.desc()
    )
    if account_id is not None:
        query = query.where(StatementModel.account_id == account_id)
    
    statements = session.exec(query).all()
    return [Statement.model_validate(stmt) for stmt in statements]


def get_statement(session: Session, statement_id: int) -> Statement | None:
    """Obtiene una cartola por ID."""
    statement = session.exec(
        select(StatementModel).where(StatementModel.id == statement_id)
    ).first()
    return Statement.model_validate(statement) if statement else None


def update_statement_status(
    session: Session, statement_id: int, status: str
) -> Statement | None:
    """Actualiza el estado de procesamiento de una cartola."""
    statement = session.exec(
        select(StatementModel).where(StatementModel.id == statement_id)
    ).first()
    if statement:
        statement.status = status
        session.add(statement)
        session.commit()
        session.refresh(statement)
        return Statement.model_validate(statement)
    return None


def get_statement_deletion_impact(
    session: Session,
    statement_id: int,
) -> StatementDeletionImpact | None:
    """Resume los datos que desaparecerian al deshacer una importacion."""
    statement = session.get(StatementModel, statement_id)
    if statement is None:
        return None

    transactions = session.exec(
        select(TransactionModel).where(TransactionModel.statement_id == statement_id)
    ).all()
    transaction_ids = [transaction.id for transaction in transactions if transaction.id]
    matches = _get_transfer_matches_for_transactions(session, transaction_ids)
    raw_target = _resolve_managed_raw_path(statement.raw_path)

    return StatementDeletionImpact(
        statement_id=statement_id,
        transaction_count=len(transactions),
        income_total_clp=sum(
            transaction.amount_clp
            for transaction in transactions
            if transaction.transaction_type == TransactionType.INCOME
        ),
        expense_total_clp=sum(
            abs(transaction.amount_clp)
            for transaction in transactions
            if transaction.transaction_type == TransactionType.EXPENSE
        ),
        net_total_clp=sum(transaction.amount_clp for transaction in transactions),
        affected_periods=sorted(
            {transaction.date.strftime("%Y-%m") for transaction in transactions}
        ),
        internal_transfer_match_count=len(matches),
        raw_file_delete_eligible=(
            raw_target is not None
            and raw_target.is_file()
            and not _raw_path_is_shared(session, statement_id, raw_target)
        ),
    )


def delete_statement(
    session: Session,
    statement_id: int,
) -> StatementDeletionResult | None:
    """Deshace una importacion y reconstruye sus datos derivados."""
    statement = session.get(StatementModel, statement_id)
    if statement is None:
        return None

    impact = get_statement_deletion_impact(session, statement_id)
    if impact is None:
        return None

    raw_path = statement.raw_path
    transactions = session.exec(
        select(TransactionModel).where(TransactionModel.statement_id == statement_id)
    ).all()
    transaction_ids = [transaction.id for transaction in transactions if transaction.id]
    matches = _get_transfer_matches_for_transactions(session, transaction_ids)

    try:
        # Este orden tambien funciona cuando SQLite aplica las claves foraneas.
        for match in matches:
            session.delete(match)
        session.flush()

        for transaction in transactions:
            session.delete(transaction)
        session.flush()

        session.delete(statement)
        session.flush()
        refresh_internal_transfer_matches(session)
        session.commit()
    except Exception:
        session.rollback()
        raise

    raw_file_deleted = _delete_raw_file_if_unreferenced(session, raw_path)
    return StatementDeletionResult(
        **impact.model_dump(),
        raw_file_deleted=raw_file_deleted,
    )


def _get_transfer_matches_for_transactions(
    session: Session,
    transaction_ids: list[int],
) -> list[InternalTransferMatchModel]:
    if not transaction_ids:
        return []
    return session.exec(
        select(InternalTransferMatchModel).where(
            or_(
                InternalTransferMatchModel.outgoing_transaction_id.in_(transaction_ids),
                InternalTransferMatchModel.incoming_transaction_id.in_(transaction_ids),
            )
        )
    ).all()


def _resolve_managed_raw_path(raw_path: str | None) -> Path | None:
    """Acepta solamente archivos ubicados dentro del directorio raw administrado."""
    if not raw_path:
        return None

    configured_path = Path(raw_path)
    target = (
        configured_path if configured_path.is_absolute() else BACKEND_DIR / configured_path
    ).resolve()
    raw_root = RAW_DIR.resolve()
    if target == raw_root or raw_root not in target.parents:
        return None
    return target


def _raw_path_is_shared(
    session: Session,
    statement_id: int,
    target: Path,
) -> bool:
    raw_paths = session.exec(
        select(StatementModel.raw_path).where(
            StatementModel.id != statement_id,
            StatementModel.raw_path.is_not(None),
        )
    ).all()
    return any(_resolve_managed_raw_path(raw_path) == target for raw_path in raw_paths)


def _delete_raw_file_if_unreferenced(
    session: Session,
    raw_path: str | None,
) -> bool:
    target = _resolve_managed_raw_path(raw_path)
    if target is None or not target.is_file():
        return False

    remaining_paths = session.exec(
        select(StatementModel.raw_path).where(StatementModel.raw_path.is_not(None))
    ).all()
    if any(_resolve_managed_raw_path(path) == target for path in remaining_paths):
        return False

    try:
        target.unlink()
    except OSError:
        logger.exception("No se pudo eliminar el PDF sin referencias %s", target)
        return False
    return True


class DuplicateStatementError(ValueError):
    """Indica que una cartola ya fue importada para una cuenta."""

    pass


def import_pdf_transactions(
    session: Session,
    *,
    account_id: int,
    file_name: str,
    file_checksum: str,
    raw_path: str,
    period_month: str,
    candidates: list[TransactionCandidate],
    category_overrides: dict[str, int | None] | None = None,
) -> PdfImportResponse:
    """Importa candidatos PDF creando cartola, movimientos y deduplicaciones."""
    account = session.get(AccountModel, account_id)
    if account is None:
        raise ValueError("La cuenta seleccionada no existe.")

    duplicate = session.exec(
        select(StatementModel).where(
            StatementModel.account_id == account_id,
            StatementModel.file_checksum == file_checksum,
        )
    ).first()
    if duplicate is not None:
        raise DuplicateStatementError(
            "Esta cartola ya fue importada para la cuenta seleccionada."
        )
    if not candidates:
        raise ValueError(
            "No se detectaron movimientos validos para importar en esta cartola."
        )

    unique_candidates, omitted_internal = _deduplicate_source_lines(candidates)
    prepared = [
        (candidate, _build_fingerprint(account_id, candidate))
        for candidate in unique_candidates
    ]
    incoming_counts = Counter(fingerprint for _, fingerprint in prepared)
    existing_counts = Counter(
        row
        for row in session.exec(
            select(TransactionModel.fingerprint).where(
                TransactionModel.account_id == account_id,
                TransactionModel.fingerprint.in_(list(incoming_counts)),
            )
        ).all()
        if row
    )
    consumed_existing: Counter[str] = Counter()

    statement = StatementModel(
        account_id=account_id,
        file_name=file_name,
        file_type="pdf",
        file_checksum=file_checksum,
        period_month=period_month,
        status=StatementStatus.PENDING,
        raw_path=raw_path,
    )
    session.add(statement)
    session.flush()

    inserted = 0
    omitted_existing = 0
    for source_row, (candidate, fingerprint) in enumerate(prepared, start=1):
        if consumed_existing[fingerprint] < existing_counts[fingerprint]:
            consumed_existing[fingerprint] += 1
            omitted_existing += 1
            continue

        candidate_key = _candidate_source_key(candidate)
        if category_overrides is not None and candidate_key in category_overrides:
            category_id = category_overrides[candidate_key]
            if category_id is not None:
                _validate_category_for_type(session, category_id, candidate.transaction_type)
            category_source = CategorySource.MANUAL
            rule_id = None
        else:
            category_id, category_source, rule_id = _categorize(
                session,
                candidate.normalized_description,
                candidate.transaction_type.value,
            )
        session.add(
            TransactionModel(
                account_id=account_id,
                statement_id=statement.id,
                source_row=source_row,
                date=candidate.date,
                description=candidate.description,
                normalized_description=candidate.normalized_description,
                amount_clp=candidate.amount_clp,
                transaction_type=candidate.transaction_type,
                category_id=category_id,
                category_source=category_source,
                rule_id_applied=rule_id,
                fingerprint=fingerprint,
                raw_data={
                    "source_id": candidate.source_id,
                    "source_line": candidate.source_line,
                },
            )
        )
        inserted += 1

    statement.status = StatementStatus.PROCESSED
    session.add(statement)
    refresh_internal_transfer_matches(session)
    session.commit()
    session.refresh(statement)
    return PdfImportResponse(
        statement=Statement.model_validate(statement),
        result=ImportTransactionsResult(
            statement_id=statement.id,
            inserted_count=inserted,
            omitted_internal_count=omitted_internal,
            omitted_existing_count=omitted_existing,
        ),
    )


def build_transaction_previews(
    session: Session,
    candidates: list[TransactionCandidate],
) -> list[TransactionPreviewCandidate]:
    """Agrega la categoria sugerida a cada candidato sin persistirlo."""
    previews: list[TransactionPreviewCandidate] = []
    for candidate in candidates:
        category_id, category_source, rule_id = _categorize(
            session,
            candidate.normalized_description,
            candidate.transaction_type.value,
        )
        previews.append(
            TransactionPreviewCandidate(
                **candidate.model_dump(
                    exclude={
                        "suggested_category_id",
                        "category_source",
                        "rule_id_applied",
                    }
                ),
                suggested_category_id=category_id,
                category_source=category_source,
                rule_id_applied=rule_id,
            )
        )
    return previews


def apply_transaction_reviews(
    session: Session,
    candidates: list[TransactionCandidate],
    reviews: list[TransactionCandidateReview],
) -> tuple[list[TransactionCandidate], dict[str, int | None]]:
    """Aplica cambios de tipo/categoria revisados contra candidatos parseados."""
    candidate_by_source = {
        _candidate_source_key(candidate): candidate for candidate in candidates
    }
    reviewed_sources: set[str] = set()
    category_overrides: dict[str, int | None] = {}

    for review in reviews:
        review_key = _review_source_key(review)
        candidate = candidate_by_source.get(review_key)
        if candidate is None:
            raise ValueError(
                "La revision incluye un movimiento que no existe en la vista previa."
            )
        if review_key in reviewed_sources:
            raise ValueError("La revision contiene movimientos duplicados.")
        reviewed_sources.add(review_key)
        if review.category_id is not None:
            _validate_category_for_type(session, review.category_id, review.transaction_type)
        category_overrides[review_key] = review.category_id

    reviewed_candidates: list[TransactionCandidate] = []
    for candidate in candidates:
        review = next(
            (
                item
                for item in reviews
                if _review_source_key(item) == _candidate_source_key(candidate)
            ),
            None,
        )
        if review is None:
            reviewed_candidates.append(candidate)
            continue

        amount = abs(candidate.amount_clp)
        if review.transaction_type == TransactionType.EXPENSE:
            amount = -amount

        reviewed_candidates.append(
            TransactionCandidate(
                source_id=candidate.source_id,
                source_line=candidate.source_line,
                date=candidate.date,
                description=candidate.description,
                normalized_description=candidate.normalized_description,
                amount_clp=amount,
                transaction_type=review.transaction_type,
            )
        )

    return reviewed_candidates, category_overrides


def _build_fingerprint(account_id: int, candidate: TransactionCandidate) -> str:
    """Genera una huella estable para detectar movimientos ya importados."""
    payload = (
        f"{account_id}|{candidate.date.isoformat()}|"
        f"{candidate.normalized_description.strip().lower()}|{candidate.amount_clp}"
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _deduplicate_source_lines(
    candidates: list[TransactionCandidate],
) -> tuple[list[TransactionCandidate], int]:
    """Elimina candidatos repetidos por identidad, preservando filas iguales reales."""
    unique: list[TransactionCandidate] = []
    seen: set[str] = set()
    omitted = 0
    for candidate in candidates:
        source_key = _candidate_source_key(candidate)
        if source_key in seen:
            omitted += 1
            continue
        seen.add(source_key)
        unique.append(candidate)
    return unique, omitted


def _candidate_source_key(candidate: TransactionCandidate) -> str:
    """Identifica una ocurrencia del PDF sin confundir filas de igual contenido."""
    return candidate.source_id or candidate.source_line.strip()


def _review_source_key(review: TransactionCandidateReview) -> str:
    """Obtiene la identidad enviada por la vista previa, con compatibilidad previa."""
    return review.source_id or review.source_line.strip()


def _categorize(
    session: Session, description: str, transaction_type: str
) -> tuple[int | None, CategorySource | None, int | None]:
    """Asigna categoria solo cuando una regla vigente calza con confianza."""
    desired_type = {
        TransactionType.INCOME.value: CategoryType.INCOME,
        TransactionType.EXPENSE.value: CategoryType.EXPENSE,
    }.get(transaction_type)
    if desired_type is None:
        raise ValueError(f"Tipo de transaccion no soportado: {transaction_type}")

    rules = session.exec(
        select(CategorizationRuleModel).order_by(
            CategorizationRuleModel.priority.desc(),
            func.length(CategorizationRuleModel.keyword).desc(),
            CategorizationRuleModel.id.asc(),
        )
    ).all()
    normalized_description = normalize_description(description)
    for rule in rules:
        try:
            keyword = normalize_description(rule.keyword)
        except ValueError:
            continue
        if not keyword:
            continue
        if f" {keyword} " in f" {normalized_description} ":
            category = session.get(CategoryModel, rule.category_id)
            if (
                category
                and category.is_active
                and category.type in {desired_type, CategoryType.TRANSFER}
            ):
                return rule.category_id, CategorySource.RULE, rule.id

    return None, None, None


def _validate_category_for_type(
    session: Session,
    category_id: int,
    transaction_type: TransactionType,
) -> None:
    desired_type = {
        TransactionType.INCOME: CategoryType.INCOME,
        TransactionType.EXPENSE: CategoryType.EXPENSE,
    }[transaction_type]
    category = session.get(CategoryModel, category_id)
    if category is None:
        raise ValueError("La categoria seleccionada no existe.")
    if not category.is_active:
        raise ValueError("La categoria seleccionada esta archivada.")
    if category.type not in {desired_type, CategoryType.TRANSFER}:
        raise ValueError(
            "La categoria seleccionada no es compatible con el tipo de movimiento."
        )
