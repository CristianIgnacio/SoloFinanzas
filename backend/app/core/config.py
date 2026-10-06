from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SoloFinanzas API"
    app_env: str = "development"
    database_path: str = "data/solo_finanzas.db"
    # Deliberately different from the legacy database; never upgrade it at startup.
    database_url: str = "sqlite:///data/cloud_dev.db"
    supabase_url: str = ""
    supabase_secret_key: str = ""
    supabase_service_role_key: str = ""
    auth_audience: str = "authenticated"
    pdf_timeout_seconds: int = 30
    pdf_max_pages: int = 50
    api_requests_per_minute: int = 120
    pdf_requests_per_minute: int = 5
    trust_proxy_headers: bool = False
    frontend_origins: list[str] = [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ]

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()


def validate_runtime_config(config: Settings, *, on_render: bool) -> None:
    """Do not serve a hosted API with local development defaults."""
    if on_render and config.app_env != "production":
        raise RuntimeError("Render requires APP_ENV=production.")
    if config.app_env == "production":
        if not config.database_url.startswith("postgres") or not config.supabase_url.startswith("https://"):
            raise RuntimeError("Production requires PostgreSQL and Supabase HTTPS.")
        if any(origin == "*" or not origin.startswith("https://") for origin in config.frontend_origins):
            raise RuntimeError("Production requires exact HTTPS frontend origins.")
