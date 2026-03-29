from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings."""

    env: str = "dev"
    debug: bool = False
    allowed_origins: list[str] = ["https://heypem.com"]
    default_rate_limit: str = "100/minute"
    max_request_size: int = 5_000_000
    database_url: str
    database_url_sync: str
    redis_url: str
    openai_api_key: str
    sentry_sdk_dsn: str

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
