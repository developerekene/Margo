from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables and .env."""

    # Load local environment variables from the project's .env file.
    model_config = SettingsConfigDict(env_file=".env")

    # Application environment; defaults to development.
    ENV: str = "development"

    # Allowed frontend origins; must be configured in the environment.
    ALLOWED_ORIGINS: List[str]

    # Firebase project ID used to initialize the Admin SDK.
    FIREBASE_PROJECT_ID: str = ""

    # Path to the service account credentials for local development.
    FIREBASE_CREDENTIALS_PATH: str = ""

    # Firebase Authentication emulator host for local testing.
    FIREBASE_AUTH_EMULATOR_HOST: str = ""

    # Cloud Firestore emulator host for local testing.
    FIRESTORE_EMULATOR_HOST: str = ""


# Instantiate settings once for application-wide use.
settings = Settings()