from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables and .env."""

    # Load local environment variables from the project's .env file.
    model_config = SettingsConfigDict(env_file=".env")

    # Application environment; defaults to development.
    ENV: str = "development"

    # Allowed frontend origins; must be configured in the environment.
    ALLOWED_ORIGINS: list[str]

    # Firebase project ID used to initialize the Admin SDK.
    FIREBASE_PROJECT_ID: str = ""

    # Path to the service account credentials for local development.
    FIREBASE_CREDENTIALS_PATH: str = ""

    # Firebase Authentication emulator host for local testing.
    FIREBASE_AUTH_EMULATOR_HOST: str = ""

    # Cloud Firestore emulator host for local testing.
    FIRESTORE_EMULATOR_HOST: str = ""

    # Firebase Web API key (Identity Toolkit REST).
    FIREBASE_WEB_API_KEY: str = ""

    # ---------------------------------------------------------------------------
    # Payment provider configuration (BE-004)
    # ---------------------------------------------------------------------------

    # Stripe secret key — used for checkout session creation and API calls.
    # Obtain from the Stripe Dashboard: Developers → API keys → Secret key.
    # Use a test-mode key (sk_test_...) during development.
    STRIPE_SECRET_KEY: str = ""

    # Stripe webhook signing secret — used to verify inbound webhook signatures.
    # Obtain from the Stripe Dashboard: Developers → Webhooks → signing secret.
    # Each webhook endpoint has its own secret.
    STRIPE_WEBHOOK_SECRET: str = ""

    # Paystack secret key — used for transaction initialization and HMAC-SHA512
    # webhook signature verification. Obtain from the Paystack Dashboard.
    # Use a test key (sk_test_...) during development.
    PAYSTACK_SECRET_KEY: str = ""

    # ---------------------------------------------------------------------------
    # Stripe checkout configuration (BE-004)
    # ---------------------------------------------------------------------------

    # Stripe Price IDs — create one per paid plan in the Stripe Dashboard
    # under Products. These map plan_id → Stripe Price ID for checkout.
    STRIPE_PRICE_PROFESSIONAL: str = ""
    STRIPE_PRICE_ENTERPRISE: str = ""

    # Frontend URLs Stripe redirects to after checkout completes or is cancelled.
    STRIPE_SUCCESS_URL: str = "http://localhost:3000/billing/success"
    STRIPE_CANCEL_URL: str = "http://localhost:3000/billing/cancel"

    # ---------------------------------------------------------------------------
    # Paystack checkout configuration (BE-004 Step 7)
    # ---------------------------------------------------------------------------

    # Paystack Plan Codes — create one per paid plan in the Paystack Dashboard.
    PAYSTACK_PLAN_PROFESSIONAL: str = ""
    PAYSTACK_PLAN_ENTERPRISE: str = ""

    # Frontend URL Paystack redirects to after checkout completes.
    PAYSTACK_CALLBACK_URL: str = "http://localhost:3000/billing/success"


# Instantiate settings once for application-wide use.
settings = Settings()
