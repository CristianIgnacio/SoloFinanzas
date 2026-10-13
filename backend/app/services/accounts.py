from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select
from app.models.user import UserModel

from app.domain.account_products import get_financial_product, kind_for_account_type
from app.domain.enums import AccountKind, CurrencyCode, InstitutionCode
from app.models.account import AccountModel
from app.schemas.account import Account, AccountCreate, AccountUpdate


class AccountDeleteConflictError(Exception):
    """Raised when an account cannot be deleted due to related records."""


class AccountProductValidationError(ValueError):
    """Raised when a product code does not match the account."""


def ensure_cash_account(session: Session, user_id) -> None:
    """Provision cash once; the partial unique index resolves concurrent logins."""
    existing = session.exec(select(AccountModel.id).where(
        AccountModel.user_id == user_id,
        AccountModel.account_kind == AccountKind.CASH,
    )).first()
    if existing is not None:
        return
    dialect = session.get_bind().dialect.name
    insert = sqlite_insert if dialect == "sqlite" else postgres_insert
    statement = insert(AccountModel).values(
        user_id=user_id,
        name="Efectivo",
        account_kind=AccountKind.CASH,
        institution=None,
        account_type="efectivo",
        product_code=None,
        account_last4=None,
        currency=CurrencyCode.CLP,
    ).on_conflict_do_nothing(
        index_elements=[AccountModel.user_id],
        index_where=text("account_kind = 'cash'"),
    )
    session.execute(statement)


def _validated_product_code(
    code: str | None, institution: InstitutionCode, account_type: str,
) -> str | None:
    if code is None:
        return None
    product = get_financial_product(code.strip())
    if product is None:
        raise AccountProductValidationError("El producto financiero no existe en el catálogo.")
    if product.institution != institution:
        raise AccountProductValidationError("El producto no pertenece a la institución seleccionada.")
    if product.kind != kind_for_account_type(account_type):
        raise AccountProductValidationError("El tipo de cuenta no corresponde al producto seleccionado.")
    return product.code


def create_account(session: Session, payload: AccountCreate) -> Account:
    """Crea una cuenta y normaliza los ultimos cuatro digitos opcionales."""
    normalized_last4 = payload.account_last4.strip() if payload.account_last4 else None
    product_code = _validated_product_code(
        payload.product_code, payload.institution, payload.account_type,
    )
    account = AccountModel(
        name=payload.name,
        institution=payload.institution,
        account_type=payload.account_type,
        product_code=product_code,
        account_last4=normalized_last4,
        currency=payload.currency,
    )
    session.add(account)
    session.commit()
    session.refresh(account)
    owner_id = session.info.get("user_id")
    if owner_id is not None:
        with Session(session.get_bind()) as identities:
            user = identities.get(UserModel, owner_id)
            if user is not None and user.onboarding_choice is None:
                user.onboarding_choice = "bank"
                identities.add(user)
                identities.commit()
    return Account.model_validate(account)


def list_accounts(session: Session) -> list[Account]:
    """List financial accounts until the cash interface is introduced."""
    accounts = session.exec(
        select(AccountModel).where(AccountModel.account_kind == AccountKind.FINANCIAL)
        .order_by(AccountModel.created_at.asc(), AccountModel.id.asc())
    ).all()
    return [Account.model_validate(account) for account in accounts]


def update_account(session: Session, account_id: int, payload: AccountUpdate) -> Account | None:
    """Actualiza una cuenta existente o devuelve None si no existe."""
    account = session.exec(select(AccountModel).where(AccountModel.id == account_id)).first()
    if not account:
        return None
    if account.account_kind == AccountKind.CASH:
        raise AccountProductValidationError("La cuenta Efectivo no se puede editar.")

    normalized_last4 = payload.account_last4.strip() if payload.account_last4 else None
    explicit_product = "product_code" in payload.model_fields_set
    requested_product = payload.product_code if explicit_product else account.product_code
    try:
        product_code = _validated_product_code(
            requested_product, payload.institution, payload.account_type,
        )
    except AccountProductValidationError:
        if explicit_product:
            raise
        # An older client may change institution/type without knowing product_code.
        product_code = None
    account.name = payload.name
    account.institution = payload.institution
    account.account_type = payload.account_type
    account.product_code = product_code
    account.account_last4 = normalized_last4
    account.currency = payload.currency

    session.add(account)
    session.commit()
    session.refresh(account)
    return Account.model_validate(account)


def delete_account(session: Session, account_id: int) -> bool:
    """Elimina una cuenta si no tiene registros asociados."""
    account = session.exec(select(AccountModel).where(AccountModel.id == account_id)).first()
    if not account:
        return False
    if account.account_kind == AccountKind.CASH:
        raise AccountDeleteConflictError("La cuenta Efectivo no se puede eliminar.")

    try:
        session.delete(account)
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise AccountDeleteConflictError(
            "No se puede eliminar la cuenta porque tiene registros asociados."
        ) from error
    return True
