import os
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    MONGODB_URL: str
    MONGODB_DB_NAME: str = "fortis"
    APP_ENV: str = "production"
    STORE_DEMO_SEED_ENABLED: bool = False
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

    @field_validator("JWT_SECRET")
    @classmethod
    def validate_jwt_secret(cls, value: str) -> str:
        secret = value.strip()
        lowered = secret.lower()
        if len(secret.encode("utf-8")) < 32 or any(marker in lowered for marker in ("replace_with", "changeme", "your-secret", "change_me")):
            raise ValueError("JWT_SECRET must be a non-placeholder secret of at least 32 bytes")
        return secret

    @field_validator("JWT_ALGORITHM")
    @classmethod
    def validate_jwt_algorithm(cls, value: str) -> str:
        algorithm = value.strip().upper()
        if algorithm not in {"HS256", "HS384", "HS512"}:
            raise ValueError("JWT_ALGORITHM must be HS256, HS384, or HS512")
        return algorithm

    class Config:
        env_file = Path(__file__).resolve().parents[1] / ".env"
        extra = "allow"


settings = Settings()


def get_gemini_api_key() -> str:
    """Prefer the explicit Gemini variable; support a Gemini key in legacy AI_API_KEY."""
    return settings.GEMINI_API_KEY.strip() or settings.AI_API_KEY.strip()
