from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    accounts,
    categories,
    categorization_rules,
    dashboard,
    health,
    statements,
    transactions,
)
from app.core.config import settings, validate_runtime_config
from app.api.routes import profile, reports
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from app.core.limits import limiter
from app.core.body_limit import BodyLimitMiddleware
from ipaddress import ip_address


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Valida la configuración; las migraciones se ejecutan por separado."""
    validate_runtime_config(settings, on_render=os.environ.get("RENDER") == "true")
    yield

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs" if settings.app_env != "production" else None,
    redoc_url="/redoc" if settings.app_env != "production" else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
app.add_middleware(BodyLimitMiddleware)

app.include_router(accounts.router, prefix="/api/v1", tags=["accounts"])
app.include_router(categories.router, prefix="/api/v1", tags=["categories"])
app.include_router(categorization_rules.router, prefix="/api/v1", tags=["categorization-rules"])
app.include_router(statements.router, prefix="/api/v1", tags=["statements"])
app.include_router(transactions.router, prefix="/api/v1", tags=["transactions"])
app.include_router(health.router, prefix="/api/v1", tags=["health"])
app.include_router(dashboard.router, prefix="/api/v1", tags=["dashboard"])


@app.get("/")
def root() -> dict[str, str]:
    """Entrega un mensaje basico para confirmar que la API esta online."""
    return {"message": "SoloFinanzas API online"}


app.include_router(profile.router, prefix="/api/v1", tags=["profile"])
app.include_router(reports.router, prefix="/api/v1", tags=["reports"])

@app.exception_handler(IntegrityError)
async def integrity_error(request, error):
    return JSONResponse(status_code=409, content={"detail": "La operación entra en conflicto con los datos existentes."})

@app.middleware("http")
async def security_headers(request: Request, call_next):
    try:
        if request.url.path.startswith("/api/v1") and request.url.path != "/api/v1/health":
            address = request.client.host if request.client else "unknown"
            # Enable only on Render's managed HTTP ingress, never on a directly
            # reachable server. Its edge supplies the original client address.
            if settings.trust_proxy_headers:
                forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
                try:
                    address = str(ip_address(forwarded))
                except ValueError:
                    pass
            limiter.check("ip:" + address, settings.api_requests_per_minute * 2)
            if request.url.path.startswith("/api/v1/statement-imports/"):
                limiter.check("pdf-ip:" + address, settings.pdf_requests_per_minute * 2)
            size = request.headers.get("content-length")
            if size and (not size.isdigit() or int(size) > 12 * 1024 * 1024):
                raise HTTPException(413, "La solicitud supera el límite permitido.")
        response = await call_next(request)
    except HTTPException as error:
        response = JSONResponse(status_code=error.status_code, content={"detail": error.detail}, headers=error.headers)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response
