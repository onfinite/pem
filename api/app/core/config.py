from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings."""

    env: str = "dev"
    debug: bool = False
    database_url: str
    database_url_sync: str
    redis_url: str
    openai_api_key: str

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
