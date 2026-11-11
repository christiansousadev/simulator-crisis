import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """APPLICATION ENVIRONMENT SETTINGS"""
    model_config = SettingsConfigDict(case_sensitive=True)

    PROJECT_NAME: str = "IncidentZero"
    PORT: int = int(os.getenv("PORT", 8000))
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./incidentzero.db")
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    # optional ai auditor interview integration, left blank disables the feature
    LLM_API_BASE_URL: str = os.getenv("LLM_API_BASE_URL", "")
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
    LLM_MODEL_ID: str = os.getenv("LLM_MODEL_ID", "claude-sonnet-5")


settings = Settings()
