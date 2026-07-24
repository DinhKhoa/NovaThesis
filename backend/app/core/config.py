import os
from pydantic_settings import BaseSettings
from pydantic import EmailStr

class Settings(BaseSettings):
    PROJECT_NAME: str = "NovaThesis API Server"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    # Security & JWT Secrets
    SECRET_KEY: str = "novathesis_super_secret_jwt_key_34d399_2026_secure"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Rate Limiting & Input Validation
    MAX_LOGIN_ATTEMPTS: int = 5
    MAX_FILE_SIZE_MB: int = 50

    # PostgreSQL Database & pgvector Connection
    POSTGRES_SERVER: str = os.getenv("POSTGRES_SERVER", "localhost")
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "postgres")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "novathesis_db")
    POSTGRES_PORT: int = int(os.getenv("POSTGRES_PORT", 5432))

    @property
    def ASYNC_DATABASE_URI(self) -> str:
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    # AI & RAG Configuration
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "mock-openai-key-for-local-dev")
    EMBEDDING_DIMENSION: int = 1536

    class Config:
        case_sensitive = True
        env_file = ".env"

settings = Settings()
