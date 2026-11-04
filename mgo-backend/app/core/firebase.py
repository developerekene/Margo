import firebase_admin
import httpx
from firebase_admin import auth, credentials, firestore

from app.core.config import settings

_app = None


def init_firebase():
    global _app
    if _app is not None:
        return _app

    if settings.FIREBASE_AUTH_EMULATOR_HOST or settings.FIRESTORE_EMULATOR_HOST:
        # Emulator mode: no real credentials needed at all.
        _app = firebase_admin.initialize_app(
            options={"projectId": settings.FIREBASE_PROJECT_ID}
        )
    elif settings.FIREBASE_CREDENTIALS_PATH:
        # Real project, local dev: use a downloaded service account key.
        cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)
        _app = firebase_admin.initialize_app(
            cred,
            {"projectId": settings.FIREBASE_PROJECT_ID},
        )
    else:
        # Production on Cloud Run: no key file at all, uses attached service account.
        _app = firebase_admin.initialize_app(
            credentials.ApplicationDefault(),
            {"projectId": settings.FIREBASE_PROJECT_ID},
        )

    return _app


def verify_id_token(id_token: str) -> dict:
    """Verify a Firebase ID token and return its decoded claims.

    Passes check_revoked=True so tokens belonging to deleted/revoked users
    fail immediately — no waiting for natural expiry.
    """
    init_firebase()
    return auth.verify_id_token(id_token, check_revoked=True)


def get_firestore_client():
    """Return a Firestore client, initialising Firebase if needed."""
    init_firebase()
    return firestore.client()


def sign_in_with_password(email: str, password: str) -> dict:
    """Sign in via Firebase Identity Toolkit and return the token response."""
    url = (
        "https://identitytoolkit.googleapis.com/v1/"
        f"accounts:signInWithPassword?key={settings.FIREBASE_WEB_API_KEY}"
    )

    response = httpx.post(
        url,
        json={
            "email": email,
            "password": password,
            "returnSecureToken": True,
        },
        timeout=15.0,
    )

    if response.status_code != 200:
        # Surface only Firebase's error code, never credentials or tokens.
        try:
            error_code = (
                response.json().get("error", {}).get("message", "UNKNOWN_ERROR")
            )
        except (ValueError, AttributeError):
            error_code = "UNKNOWN_ERROR"

        raise ValueError(f"Firebase sign-in failed: {error_code}")

    return response.json()


def send_password_reset_email(email: str) -> None:
    """Send a Firebase set-password (password-reset) link to the given address.

    Used for invited users so they can choose their own password on first login.
    Calls the Identity Toolkit REST endpoint directly — the Admin SDK does not
    expose this operation.
    """
    url = (
        "https://identitytoolkit.googleapis.com/v1/"
        f"accounts:sendOobCode?key={settings.FIREBASE_WEB_API_KEY}"
    )

    response = httpx.post(
        url,
        json={
            "requestType": "PASSWORD_RESET",
            "email": email,
        },
        timeout=15.0,
    )

    if response.status_code != 200:
        try:
            error_code = (
                response.json().get("error", {}).get("message", "UNKNOWN_ERROR")
            )
        except (ValueError, AttributeError):
            error_code = "UNKNOWN_ERROR"

        raise ValueError(f"Firebase sendOobCode failed: {error_code}")
