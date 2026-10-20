import os
from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    MONGODB_URL: str
    MONGODB_DB_NAME: str = "fortis"
    DATABASE_URL: str = "sqlite:///./fortis.db"
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = ""
    SMTP_STARTTLS: bool = True
    FRONTEND_BASE_URL: str = "http://localhost:5173"
    EMAIL_VERIFICATION_EXPIRE_MINUTES: int = 30
    AI_PROVIDER: str = "gemini"
    AI_API_KEY: str = ""
    AI_MODEL: str = "gpt-4o-mini"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.5-flash-lite"
    CORS_ORIGINS: list = ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"]
    MAX_UPLOAD_SIZE_MB: int = 4 if os.getenv("VERCEL") else 50
    UPLOAD_DIR: str = "/tmp/fortis-uploads" if os.getenv("VERCEL") else "uploads"
    AUTH_RATE_LIMIT_ENABLED: bool = True
    AUTH_RATE_LIMIT_LOGIN_PER_MINUTE: int = 15
    AUTH_RATE_LIMIT_REGISTER_PER_MINUTE: int = 10
    AUTH_MAX_FAILED_LOGIN_ATTEMPTS: int = 5
    AUTH_LOCKOUT_MINUTES: int = 15
    AI_USAGE_WARNING_PERCENT: float = 80.0
    AI_DAILY_REQUEST_BUDGET: int = 0
    AI_REQUESTS_PER_MINUTE_BUDGET: int = 0
    AI_TOKENS_PER_MINUTE_BUDGET: int = 0

    class Config:
        env_file = Path(__file__).resolve().parents[1] / ".env"
        extra = "allow"


settings = Settings()


def get_gemini_api_key() -> str:
    """Prefer the explicit Gemini variable; support a Gemini key in legacy AI_API_KEY."""
    return settings.GEMINI_API_KEY.strip() or settings.AI_API_KEY.strip()
