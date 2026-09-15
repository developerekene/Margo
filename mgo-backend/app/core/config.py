from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    ENV: str = "development"          # optional — safe to default, low-stakes
    ALLOWED_ORIGINS: List[str]         # required — no default, must come from .env

    FIREBASE_PROJECT_ID: str = ""
    FIREBASE_CREDENTIALS_PATH: str = ""

    class Config:
        env_file = ".env"


settings = Settings()