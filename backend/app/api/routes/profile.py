import time

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.encoders import jsonable_encoder
from sqlmodel import Session, select

from app.core.auth import Identity, get_identity
from app.core.config import settings
from app.core.database import get_session
from app.core.tenancy import OWNED_MODELS, TenantSession
from app.models import AccountModel, CategoryModel, CategorizationRuleModel, StatementModel, TransactionModel, InternalTransferMatchModel
from app.models.user import UserModel

router = APIRouter()


@router.get("/me")
def me(identity: Identity = Depends(get_identity), session: TenantSession = Depends(get_session)):
    return {"id": str(identity.id), "email": identity.email, "display_name": identity.name}


@router.get("/me/export")
def export_data(session: TenantSession = Depends(get_session)):
    import json
    data = {"format_version": 1, "user_id": str(session.info["user_id"])}
    for model in OWNED_MODELS:
        data[model.__tablename__] = [
            row.model_dump(mode="json", exclude={"raw_path", "raw_data"})
            for row in session.exec(select(model)).all()
        ]
    return Response(json.dumps(data, ensure_ascii=False), media_type="application/json",
                    headers={"Content-Disposition": 'attachment; filename="solofinanzas.json"'})


@router.delete("/me", status_code=204)
def delete_me(identity: Identity = Depends(get_identity), session: TenantSession = Depends(get_session)):
    recent = max((entry.get("timestamp", 0) for entry in identity.claims.get("amr", [])
                  if entry.get("method") == "oauth"), default=0)
    if time.time() - recent > 600:
        raise HTTPException(403, "Vuelve a iniciar sesión con Google antes de eliminar tu cuenta.")
    admin_key = settings.supabase_secret_key or settings.supabase_service_role_key
    if not admin_key:
        raise HTTPException(503, "La eliminación de cuenta aún no está configurada.")
    # Tombstone immediately blocks old JWTs, and makes provider failures retryable.
    with Session(session.get_bind()) as identities:
        user = identities.get(UserModel, identity.id)
        user.deletion_pending = True
        user.email = ""
        user.display_name = ""
        identities.add(user)
        identities.commit()
    for model in (InternalTransferMatchModel, TransactionModel, CategorizationRuleModel,
                  StatementModel, AccountModel):
        for row in session.exec(select(model)).all():
            session.delete(row)
        session.flush()
    categories = session.exec(select(CategoryModel)).all()
    for row in categories:
        if row.parent_id is not None:
            session.delete(row)
    session.flush()
    for row in categories:
        if row.parent_id is None:
            session.delete(row)
    session.commit()
    try:
        response = httpx.delete(
            settings.supabase_url.rstrip("/") + "/auth/v1/admin/users/" + str(identity.id),
            headers={"apikey": admin_key,
                     "Authorization": "Bearer " + admin_key}, timeout=15,
        )
        if response.status_code not in (200, 204, 404):
            raise HTTPException(503, "Tus datos fueron eliminados; reintenta para completar la baja del acceso.")
    except httpx.HTTPError as error:
        raise HTTPException(503, "Tus datos fueron eliminados; reintenta para completar la baja del acceso.") from error
