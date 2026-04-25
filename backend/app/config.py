from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str
    secret_key: str
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    cors_origins: str = "http://localhost:15173"
    redis_url: str = "redis://localhost:6379/0"
    lioren_api_url: str = "https://api.lioren.cl/v1"
    lioren_api_key: str = ""
    lioren_webhook_secret: str = ""

    # Observability (W1-06)
    sentry_dsn: str = ""
    sentry_env: str = "production"
    sentry_traces_sample_rate: float = 0.0
    sentry_release: str = ""
    log_format: str = "pretty"  # "json" | "pretty"
    log_level: str = "INFO"

settings = Settings()
