#!/usr/bin/env python
"""bootstrap_platform_admin.py — one-time CLI to promote an existing Firebase user to platform_admin.

This is the ONLY way to create the first platform admin. After the first admin
exists, additional platform admins can be created via the API endpoint
POST /api/v1/identity/platform-admins.

Usage (from the repo root, with venv active and real Firebase credentials configured):

    python scripts/bootstrap_platform_admin.py --email admin@example.com

The script will:
1. Look up the Firebase Auth user by email.
2. Preserve any existing custom claims other than `role` and `tenant_id`.
3. Set `role = "platform_admin"` and remove any `tenant_id` claim.

Prerequisites:
- FIREBASE_PROJECT_ID must be set in .env or the environment.
- Either FIREBASE_CREDENTIALS_PATH (local dev) or Application Default Credentials
  (Cloud Run / CI) must be available.
- The target email must already exist in Firebase Auth (create via Firebase Console
  or via a normal registration that you will then promote).

Never run this script against the live project from a developer machine unless
you have confirmed the correct FIREBASE_PROJECT_ID is set.
"""

import argparse

# Ensure the app package is importable from the repo root.
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from firebase_admin import auth

from app.core.firebase import init_firebase


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Set platform_admin claim on an existing Firebase user."
    )
    parser.add_argument(
        "--email",
        required=True,
        help="Email address of the user to promote.",
    )
    args = parser.parse_args()

    init_firebase()

    try:
        user = auth.get_user_by_email(args.email)
    except auth.UserNotFoundError:
        print(f"ERROR: No Firebase user found with email: {args.email}")
        sys.exit(1)

    existing_claims = user.custom_claims or {}

    # Keep any claims that are not role or tenant_id, then set platform_admin.
    new_claims = {
        k: v for k, v in existing_claims.items() if k not in ("role", "tenant_id")
    }
    new_claims["role"] = "platform_admin"
    # Explicitly remove tenant_id — platform admins are cross-tenant.
    new_claims.pop("tenant_id", None)

    auth.set_custom_user_claims(user.uid, new_claims)

    print(f"Success: uid={user.uid} email={args.email} is now a platform_admin.")


if __name__ == "__main__":
    main()
