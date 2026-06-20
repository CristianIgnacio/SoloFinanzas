from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.models.account import AccountModel
from app.schemas.account import Account, AccountCreate, AccountUpdate


class AccountDeleteConflictError(Exception):
    """Raised when an account cannot be deleted due to related records."""


def create_account(session: Session, payload: AccountCreate) -> Account:
    """Crea una cuenta y normaliza los ultimos cuatro digitos opcionales."""
    normalized_last4 = payload.account_last4.strip() if payload.account_last4 else None
    account = AccountModel(
        name=payload.name,
        institution=payload.institution,
        account_type=payload.account_type,
        account_last4=normalized_last4,
        currency=payload.currency,
    )
    session.add(account)
    session.commit()
    session.refresh(account)
    return Account.model_validate(account)


def list_accounts(session: Session) -> list[Account]:
    """Lista cuentas en orden de creacion estable."""
    accounts = session.exec(
        select(AccountModel).order_by(AccountModel.created_at.asc(), AccountModel.id.asc())
    ).all()
    return [Account.model_validate(account) for account in accounts]


def update_account(session: Session, account_id: int, payload: AccountUpdate) -> Account | None:
    """Actualiza una cuenta existente o devuelve None si no existe."""
    account = session.exec(select(AccountModel).where(AccountModel.id == account_id)).first()
    if not account:
        return None

    normalized_last4 = payload.account_last4.strip() if payload.account_last4 else None
    account.name = payload.name
    account.institution = payload.institution
    account.account_type = payload.account_type
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

    try:
        session.delete(account)
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise AccountDeleteConflictError(
            "No se puede eliminar la cuenta porque tiene registros asociados."
        ) from error
    return True
