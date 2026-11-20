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

        # Plan price in the currency's smallest unit (kobo for NGN). Optional:
    # sent to Paystack with the plan code and used to check the amount paid.
    # 0 means "not configured" (amount is then not sent or checked).
    PAYSTACK_AMOUNT_PROFESSIONAL: int = 0
    PAYSTACK_AMOUNT_ENTERPRISE: int = 0

    # ---------------------------------------------------------------------------
    # Billing rules (PROVISIONAL until Margo confirms) - all configurable
    # ---------------------------------------------------------------------------
    BILLING_TRIAL_DAYS: int = 14
    BILLING_GRACE_DAYS: int = 7
    BILLING_TRIAL_PLAN_ID: str = "starter"

    # Optional JSON overriding the plan catalogue, e.g.
    # {"starter": {"name": "Starter", "limits": {"users": 3, "documents": 10,
    #  "crawl_pages": 100, "monthly_messages": 500, "widget_domains": 1}}}
    BILLING_PLANS_JSON: str = ""

    # ---------------------------------------------------------------------------
    # Knowledge ingestion (BE-005)
    # ---------------------------------------------------------------------------

    # GCP project and Cloud Tasks region.
    GCP_PROJECT: str = ""
    GCP_LOCATION: str = "us-central1"

    # Cloud Tasks queue names (provisioned by BE-010 / infra).
    CLOUD_TASKS_CRAWL_QUEUE: str = "crawl-pages"
    CLOUD_TASKS_DOC_QUEUE: str = "document-processing"

    # Public base URL of this API service (no trailing slash).
    # Cloud Tasks uses this to build the internal callback URLs.
    # Example: https://margo-api.onrender.com
    KNOWLEDGE_BASE_URL: str = ""

    # Service account email that signs Cloud Tasks OIDC tokens.
    KNOWLEDGE_TASK_SA_EMAIL: str = ""

    # Expected `aud` claim in inbound OIDC tokens.
    # Set to the same value as KNOWLEDGE_BASE_URL.
    KNOWLEDGE_OIDC_AUDIENCE: str = ""

    # Cloud Storage bucket for uploaded documents (provisioned by BE-010 / infra).
    GCS_BUCKET: str = ""

    # Maximum upload size for documents, in megabytes.
    KNOWLEDGE_MAX_UPLOAD_MB: int = 20

    # Hard cap on pages discovered per crawl request.
    KNOWLEDGE_MAX_CRAWL_PAGES: int = 100

    # Maximum extracted text length in characters (prevents embedding overload).
    KNOWLEDGE_MAX_CONTENT_CHARS: int = 500_000

    # Per-page HTTP timeout for the crawler, in seconds.
    KNOWLEDGE_CRAWL_TIMEOUT_SECONDS: int = 10


# Instantiate settings once for application-wide use.
settings = Settings()
