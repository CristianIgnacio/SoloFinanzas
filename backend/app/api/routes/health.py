from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def healthcheck() -> dict[str, str]:
    """Confirma que el servicio HTTP responde correctamente."""
    return {"status": "ok"}
