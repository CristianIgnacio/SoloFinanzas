from dataclasses import dataclass
from functools import lru_cache
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class Identity:
    id: UUID
    email: str
    name: str
    claims: dict


@lru_cache(maxsize=1)
def jwks_client():
    return jwt.PyJWKClient(
        settings.supabase_url.rstrip("/") + "/auth/v1/.well-known/jwks.json",
        cache_keys=False, lifespan=300, timeout=10,
    )


def decode_token(token: str) -> dict:
    signing_key = jwks_client().get_signing_key_from_jwt(token)
    return jwt.decode(
        token, signing_key.key, algorithms=["ES256", "RS256"],
        audience=settings.auth_audience,
        issuer=settings.supabase_url.rstrip("/") + "/auth/v1",
        options={"require": ["exp", "iat", "iss", "aud", "sub"]},
    )


def get_identity(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> Identity:
    if credentials is None:
        raise HTTPException(401, "Debes iniciar sesión.", headers={"WWW-Authenticate": "Bearer"})
    if not settings.supabase_url:
        raise HTTPException(503, "El acceso aún no está configurado.")
    try:
        claims = decode_token(credentials.credentials)
        owner = UUID(claims["sub"])
        if claims.get("role") != "authenticated":
            raise ValueError("Invalid role")
        if claims.get("app_metadata", {}).get("provider") != "google":
            raise ValueError("Google is the only enabled provider")
    except jwt.PyJWKClientConnectionError as error:
        raise HTTPException(503, "El servicio de acceso no está disponible.") from error
    except (jwt.PyJWTError, ValueError, KeyError, TypeError) as error:
        raise HTTPException(401, "La sesión no es válida. Vuelve a ingresar.", headers={"WWW-Authenticate": "Bearer"}) from error
    from app.core.limits import limiter
    limiter.check("user:" + str(owner), settings.api_requests_per_minute)
    if request.url.path.startswith("/api/v1/statement-imports/"):
        limiter.check("pdf:" + str(owner), settings.pdf_requests_per_minute)
    metadata = claims.get("user_metadata", {})
    return Identity(owner, claims.get("email", ""), metadata.get("full_name", ""), claims)
