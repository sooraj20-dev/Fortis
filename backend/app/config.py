import os
from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    MONGODB_URL: str
    MONGODB_DB_NAME: str = "fortis"
    DATABASE_URL: str = "sqlite:///./fortis.db"
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    AI_PROVIDER: str = "openai"
    AI_API_KEY: str = ""
    AI_MODEL: str = "gpt-4o-mini"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-1.5-flash"
    CORS_ORIGINS: list = ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"]
    MAX_UPLOAD_SIZE_MB: int = 4 if os.getenv("VERCEL") else 50
    UPLOAD_DIR: str = "/tmp/fortis-uploads" if os.getenv("VERCEL") else "uploads"

    class Config:
        env_file = Path(__file__).resolve().parents[1] / ".env"
        extra = "allow"


settings = Settings()
