import firebase_admin
from firebase_admin import credentials, auth, firestore

from app.core.config import settings

_app = None


def init_firebase():
    global _app
    if _app is not None:
        return _app

    if settings.FIREBASE_AUTH_EMULATOR_HOST or settings.FIRESTORE_EMULATOR_HOST:
        # Emulator mode: no real credentials needed at all.
        _app = firebase_admin.initialize_app(options={"projectId": settings.FIREBASE_PROJECT_ID})
    elif settings.FIREBASE_CREDENTIALS_PATH:
        # Real project, local dev: use a downloaded service account key.
        cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)
        _app = firebase_admin.initialize_app(cred, {"projectId": settings.FIREBASE_PROJECT_ID})
    else:
        # Production on Cloud Run: no key file at all, uses the attached service account.
        _app = firebase_admin.initialize_app(
            credentials.ApplicationDefault(),
            {"projectId": settings.FIREBASE_PROJECT_ID},
        )

    return _app


def verify_id_token(id_token: str) -> dict:
    init_firebase()
    return auth.verify_id_token(id_token)


def get_firestore_client():
    init_firebase()
    return firestore.client()