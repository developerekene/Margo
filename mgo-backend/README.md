# Margo Backend — API Contract & Frontend Integration README

## 1. Overview

Margo is a multi-tenant SaaS platform built as a **FastAPI modular monolith**.

The backend is organized into independent modules with clearly defined boundaries. Modules communicate through **ports and events** rather than importing one another's internal implementation details.

### Core Modules

- `identity`
- `billing`
- `knowledge`
- `embedding`
- `retrieval`
- `agent`
- `chat`
- `platform`

### Core Architecture Rule

The frontend communicates with the Margo FastAPI backend.

```text
Frontend
   |
   | HTTP / WebSocket
   v
FastAPI API
   |
   +-----------------------------+
   |                             |
   v                             v
Margo Modules                 Firebase
                              Auth + Firestore
```

> **Important:** The frontend must not communicate directly with Firebase Auth or Firestore. Firebase is accessed by the FastAPI service.

---

## 2. Backend Architecture

Margo uses a modular-monolith architecture.

Each business capability lives inside its own module.

```text
app/
├── core/
├── shared/
├── modules/
│   ├── identity/
│   ├── billing/
│   ├── knowledge/
│   ├── embedding/
│   ├── retrieval/
│   ├── agent/
│   ├── chat/
│   └── platform/
├── router.py
└── main.py
```

### Module Boundary Rule

Modules must not directly import another module's internal implementation.

Communication between modules should happen through:

- `ports.py`
- events
- approved shared infrastructure (`app.shared.container`)

The Import Linter contract enforces module independence.

---

## 3. Project Structure

```text
mgo-backend/
├── app/
│   ├── __init__.py
│   │
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py
│   │   ├── firebase.py
│   │   └── responses.py
│   │
│   ├── modules/
│   │   ├── __init__.py
│   │   │
│   │   ├── identity/
│   │   │   ├── __init__.py
│   │   │   ├── api.py
│   │   │   ├── events.py
│   │   │   ├── permissions.py
│   │   │   ├── ports.py
│   │   │   ├── schemas.py
│   │   │   └── service.py
│   │   │
│   │   ├── billing/
│   │   │   ├── __init__.py
│   │   │   ├── api.py
│   │   │   ├── constants.py
│   │   │   ├── events.py
│   │   │   ├── paystack_webhooks.py
│   │   │   ├── permissions.py
│   │   │   ├── plans.py
│   │   │   ├── ports.py
│   │   │   ├── schemas.py
│   │   │   ├── service.py
│   │   │   ├── webhooks.py
│   │   │   └── webhook_runner.py
│   │   │
│   │   ├── knowledge/
│   │   ├── embedding/
│   │   ├── retrieval/
│   │   ├── agent/
│   │   ├── chat/
│   │   └── platform/
│   │
│   ├── shared/
│   │   ├── __init__.py
│   │   ├── container.py
│   │   └── event_bus.py
│   │
│   ├── main.py
│   └── router.py
│
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   ├── fake_firestore.py
│   ├── test_billing_checkout.py
│   ├── test_billing_plans.py
│   ├── test_billing_ports.py
│   ├── test_billing_service.py
│   ├── test_billing_subscription.py
│   ├── test_billing_usage.py
│   ├── test_billing_webhooks.py
│   ├── test_identity_forgot_password.py
│   ├── test_identity_invited_login.py
│   ├── test_identity_login.py
│   ├── test_identity_permissions.py
│   ├── test_identity_platform.py
│   ├── test_identity_registration.py
│   ├── test_identity_users.py
│   ├── test_identity_verification.py
│   └── test_identity_widgets.py
│
├── scripts/
│   └── bootstrap_platform_admin.py
│
├── .env.example
├── Dockerfile
├── lint.sh
├── requirements.txt
├── requirements-dev.txt
├── setup.cfg
└── README.md
```

---

## 4. Technology Stack

### Backend

- Python
- FastAPI
- Pydantic
- Firebase Admin SDK
- Firestore
- Cloud Tasks
- WebSockets

### AI / Knowledge

- Gemini
- Embeddings
- Firestore native vector search
- Retrieval-augmented generation

### Payments

- Stripe
- Paystack

### Infrastructure

- Firebase Hosting
- Google Cloud Run
- Cloud Tasks
- Cloud Armor
- Firestore

---

## 5. Firebase Architecture

Firebase is the sole datastore layer for the MVP.

It provides:

- Firebase Authentication
- Firestore
- Firestore native vector search

The backend is the only application layer that communicates with Firebase.

```text
Browser
   |
   | API requests
   v
FastAPI
   |
   +---- Firebase Authentication
   |
   +---- Firestore
```

### Frontend Restriction

The frontend must **not**:

- call Firestore directly
- read or write Firestore documents
- perform Firebase Auth operations directly
- bypass the FastAPI API

All application requests must go through the Margo API.

---

## 6. Authentication

Authentication is handled through the Margo backend API.

The frontend should treat the FastAPI API as the application authentication boundary.

### Authorization Header

Authenticated API requests use:

```http
Authorization: Bearer <token>
```

The identity module is responsible for token verification and identity resolution.

### Token Validation Policy (BE-004)

Every authenticated request passes the bearer token through `verify_id_token` with `check_revoked=True`. The token is then checked for:

1. **Validity and expiry** — invalid/expired tokens return `401`.
2. **Revocation** — tokens belonging to revoked sessions return `401`.
3. **Email verification** — tokens where `email_verified=False` return `403 email_not_verified`.
4. **Role claim** — tokens without a `role` claim return `403 permission_denied`.

The `email_verified` flag is read from the Firebase token (a trusted server-side claim). Clients cannot supply or override it.

---

## 7. API Base URL

All public REST endpoints use the `/api/v1` prefix.

Example:

```text
/api/v1/identity/me
```

Production frontend configuration should use:

```env
VITE_API_BASE_URL=/api/v1
```

---

## 8. Standard API Response Format

Successful responses use:

```json
{
  "data": {},
  "error": null
}
```

Failed responses use:

```json
{
  "data": null,
  "error": {
    "code": "example_error",
    "message": "Human-readable error message",
    "details": {}
  }
}
```

HTTP status codes should correctly represent the result of the request.

---

## 9. Pagination

List endpoints use cursor-based pagination.

Example:

```http
GET /api/v1/identity/{tenant_id}/users?limit=20&cursor=<opaque>
```

A paginated response includes:

```json
{
  "data": {
    "items": [],
    "next_cursor": null
  },
  "error": null
}
```

The frontend should treat `next_cursor` as an opaque value.

---

## 10. Date and Time Format

API timestamps use ISO 8601 UTC.

Example: `2026-09-15T12:30:00Z`

---

# 11. Identity API (BE-003 + BE-004)

Identity manages tenant registration, email verification, login, users, roles, invitations, widget domains, platform administrators, and session management.

## Roles

| Role | Scope |
|---|---|
| `platform_admin` | Cross-tenant super-admin |
| `company_owner` | Created at registration; manages admins + members |
| `company_admin` | Manages members; invited by owner/admin |
| `company_member` | Invited by owner/admin |

Tokens with no `role` claim are rejected with `403 permission_denied` everywhere.

## Firestore Data Model

```text
tenants/{tenant_id}
  name, admin_email, website_url, status, widget_id, created_at

tenants/{tenant_id}/members/{uid}
  uid, email, name, role, status ("active" | "invited"),
  invited_by, created_at

widgets/{widget_id}
  tenant_id, allowed_domains[]
```

`widget_id` = `wgt_` + 12 hex chars, generated at registration.

---

## Registration and Email Verification Workflow (BE-004)

The registration flow is a **two-step** process. No session token is issued at registration time.

```text
1. POST /identity/register
       |
       v
   Validate input
       |
       v
   Create Firebase Auth user + set claims
       |
       v
   Write tenant + widget + member docs
       |
       v
   Emit TenantRegistered event
   (billing creates trial subscription here)
       |
       v
   Send Firebase email-verification link
       |
       v
   Return 200 { status: "verification_required" }
       |
       (no token issued)
       |
2. User clicks verification link in email
       |
       v
   Firebase marks email_verified = true
       |
3. POST /identity/login
       |
       v
   Backend verifies email_verified = true
       |
       v
   Return token + company context
```

**Why no token at registration?**
A session token returned at registration would allow unverified accounts to access protected endpoints. The trial subscription is created at registration (so billing is ready), but the user cannot access it until their email is verified.

---

### POST /api/v1/identity/register

Create a tenant and owner. No auth required.

```json
// Request
{
  "company_name": "Acme Systems",
  "company_email": "admin@acme.example",
  "admin_name": "Alex Admin",
  "password": "securepassword123",
  "website_url": "https://acme.example"
}
```

`website_url` is optional. The service always sets `company_owner` — there is no `role` field on this schema.

```json
// Response 200
{
  "data": {
    "status": "verification_required",
    "email": "admin@acme.example",
    "message": "A verification email has been sent to your address. Please verify your email before signing in."
  },
  "error": null
}
```

**No token is issued at registration.** The user must verify their email before signing in.

**Frontend behavior:**
- Show a confirmation screen telling the user to check their email.
- Provide a "Resend verification email" option (calls `POST /identity/resend-verification`).
- Do not redirect to the dashboard or attempt login until after verification.

| Error code | HTTP | Meaning |
|---|---|---|
| `email_already_registered` | 409 | Email already in Firebase Auth |
| `registration_failed` | 500 | Post-user step failed; Auth user deleted (no orphan) |

---

### POST /api/v1/identity/resend-verification

Resend an email-verification link. No auth required.

**Rate limited:** one email per address per 60 seconds (in-memory, resets on server restart).

```json
// Request
{ "email": "admin@acme.example" }
```

```json
// Response 200 (always the same regardless of account existence)
{
  "data": {
    "message": "If an unverified account exists for this email, a new verification link has been sent."
  },
  "error": null
}
```

**Security notes:**
- Response is identical whether the email is known, unknown, or already verified (prevents account enumeration).
- Already-verified accounts do not receive a second email.
- Requests within the 60-second cooldown window return the same response without sending.

---

### POST /api/v1/identity/login

Email + password login. No auth required. **Requires prior email verification.**

```json
// Request
{ "email": "admin@acme.example", "password": "securepassword123" }
```

```json
// Response 200
{
  "data": {
    "token": "<firebase_id_token>",
    "uid": "firebase_uid",
    "role": "company_owner",
    "tenant_id": "acme-systems-a1b2c3",
    "email": "admin@acme.example",
    "display_name": "Alex Admin",
    "company_name": "Acme Systems"
  },
  "error": null
}
```

- `company_name` is read from the `tenants/{tenant_id}` document, never inferred from the email domain.
- `display_name` may be `null` if not set.
- `tenant_id` and `company_name` are `null` for `platform_admin` accounts.

Firebase error codes are **never** returned to the caller — only logged server-side.

| Error code | HTTP | Meaning |
|---|---|---|
| `invalid_credentials` | 401 | Wrong email or password |
| `too_many_attempts` | 429 | Firebase rate limit |
| `email_not_verified` | 403 | Email has not been verified |
| `subscription_inactive` | 403 | Tenant not active |
| `permission_denied` | 403 | Token has no `role` claim |

**Invited member behavior on first login:**
Status is flipped from `"invited"` to `"active"` in Firestore. Invited users and platform admins are created with `email_verified=True` up front (the set-password link emailed to them serves as proof of email ownership).

**Unverified login handling:**
If an account is not verified, login returns HTTP 403 `email_not_verified` and sends a fresh verification email (cooldown-limited to 60s per email). Login accepts passwords of 1–128 characters to remain compatible with Firebase's hosted set-password page (which permits 6 characters).

---

### POST /api/v1/identity/forgot-password

Request a password-reset email. No auth required.

```json
// Request
{ "email": "admin@acme.example" }
// Response 200
{
  "data": { "message": "If an account exists for this email, a password reset link has been sent." },
  "error": null
}
```

Response is intentionally generic (no account-existence disclosure).

---

### GET /api/v1/identity/me

Returns the authenticated caller's profile and company context. Requires `Authorization: Bearer <token>`.

Unverified tokens return `403 email_not_verified`.

```json
// Response 200
{
  "data": {
    "uid": "firebase_uid",
    "email": "admin@acme.example",
    "role": "company_owner",
    "tenant_id": "acme-systems-a1b2c3",
    "display_name": "Alex Admin",
    "company_name": "Acme Systems"
  },
  "error": null
}
```

- `company_name` is read from the tenant record. Never inferred from the email domain.
- `tenant_id` and `company_name` are `null` for `platform_admin` accounts.

---

### POST /api/v1/identity/logout

Sign out from the **current device**. Requires auth.

```json
// Response 200
{
  "data": {
    "status": "logged_out",
    "message": "Signed out from this device. Please discard your token. Other sessions remain active."
  },
  "error": null
}
```

**Limitation:** Firebase bearer tokens cannot be invalidated server-side per-device. The client must discard its stored token. The token remains cryptographically valid until natural expiry (~1 hour). Other sessions are unaffected.

---

### POST /api/v1/identity/logout/all

Sign out from **all devices** by revoking Firebase refresh tokens. Requires auth.

```json
// Response 200
{
  "data": {
    "status": "logged_out",
    "message": "Signed out from all devices. All existing sessions have been revoked."
  },
  "error": null
}
```

**Behavior:** Firebase refresh-token revocation via Admin SDK. Because `verify_id_token` is called with `check_revoked=True` on every request, revoked sessions fail at the next validation. There is a ~1-minute window before Firebase's token cache propagates the revocation.

| Error code | HTTP | Meaning |
|---|---|---|
| `logout_failed` | 500 | Firebase token revocation failed |

---

### GET /api/v1/identity/{tenant_id}/users

Paginated member list. Auth: owner/admin of own tenant, or platform_admin.

`?limit=20&cursor=<opaque>` (max limit 100)

```json
// Response 200
{
  "data": {
    "users": [{
      "uid": "uid1", "email": "u@acme.example", "name": "User",
      "role": "company_admin", "status": "active",
      "invited_by": "owner-uid", "created_at": "2026-01-01T00:00:00+00:00"
    }],
    "next_cursor": null
  },
  "error": null
}
```

---

### POST /api/v1/identity/{tenant_id}/users/invite

Invite a user. Auth: owner/admin of own tenant.

```json
// Request
{ "email": "new@acme.example", "name": "New User", "role": "company_member" }
```

`role` must be `"company_admin"` or `"company_member"` — `"platform_admin"` is rejected by schema. `tenant_id` is always read from the **path**, never the body. A Firebase set-password email is sent to the invitee.

**Invited user verification policy:**
Invited users are created with `email_verified=True` up front. The password-reset link emailed to the user serves as cryptographic proof that they own the address. This ensures that when the invitee sets their password and logs in, they are immediately allowed through the verification gate.

```json
// Response 200
{ "data": { "status": "invited", "email": "new@acme.example" }, "error": null }
```

| Error code | HTTP | Meaning |
|---|---|---|
| `email_already_registered` | 409 | Email exists (tenant not revealed) |
| `invite_failed` | 500 | Post-user step failed; Auth user deleted |

---

### GET /api/v1/identity/{tenant_id}/users/invite

Members with `status: "invited"`. Auth: owner/admin of own tenant. Paginated.

```json
// Response 200
{ "data": { "invites": [...], "next_cursor": null }, "error": null }
```

---

### DELETE /api/v1/identity/{tenant_id}/users/{user_id}

Remove a member. Auth: owner/admin of own tenant.

| Caller role | Can remove |
|---|---|
| `company_owner` | `company_admin`, `company_member` |
| `company_admin` | `company_member` only |

On success: member doc deleted, refresh tokens revoked, Auth user deleted.

```json
// Response 200
{ "data": { "status": "removed" }, "error": null }
```

| Error code | HTTP | Meaning |
|---|---|---|
| `cannot_remove_self` | 400 | Caller is the target |
| `cannot_remove_owner` | 403 | Owner cannot be removed |
| `permission_denied` | 403 | Role insufficient |
| `user_not_found` | 404 | Target not in this tenant |

---

### GET /api/v1/identity/{tenant_id}/widget-domains

List allowed domains. Auth: owner/admin of own tenant.

```json
// Response 200
{ "data": { "domains": ["acme.example", "localhost"] }, "error": null }
```

---

### POST /api/v1/identity/{tenant_id}/widget-domains

Add a domain. Auth: owner/admin of own tenant.

```json
// Request
{ "domain": "https://acme.example:8080/any/path" }
// Stored as: "acme.example"
```

Rules: `"localhost"` allowed; wildcards (`*`) rejected; deduplication applied; max 20 per tenant.

| Error code | HTTP | Meaning |
|---|---|---|
| `wildcard_not_allowed` | 400 | Domain contains `*` |
| `domain_limit_reached` | 400 | Already at 20 domains |

---

### GET /api/v1/identity/tenants

All tenants, paginated. Auth: platform_admin only.

`?limit=20&cursor=<opaque>` (max 100)

---

### POST /api/v1/identity/platform-admins

Create a platform admin. Auth: platform_admin only. Sends set-password email.

```json
// Request
{ "email": "newadmin@platform.example", "name": "Platform Admin" }
// Response 200
{ "data": { "uid": "firebase_uid", "email": "newadmin@platform.example", "status": "invited" }, "error": null }
```

**Platform admin verification policy:**
Platform admins created via this endpoint are created with `email_verified=True` up front. Platform admins have no `tenant_id` claim and `company_name` is `null` in all responses.

| Error code | HTTP | Meaning |
|---|---|---|
| `email_already_registered` | 409 | Email already exists |
| `platform_admin_creation_failed` | 500 | Post-user step failed; Auth user deleted |

> **Bootstrap:** To create the **first** platform admin via CLI:
> ```bash
> python scripts/bootstrap_platform_admin.py --email admin@platform.example [--mark-verified]
> ```
> Use `--mark-verified` to set `email_verified=True` if the account was created unverified outside the invite flow.

---

# 12. Billing API (BE-004)

Billing manages subscriptions, multi-tenant payment provider checkouts (Stripe and Paystack), webhook processing, normalized invoice history, entitlement enforcement ports, and resource usage metering.

## Architectural Boundaries

* **No direct Firebase imports:** Billing never imports `app.core.firebase` or `firebase_admin` directly. All Firestore access goes through the shared service container locator `app.shared.container.get_db()`, enforcing the Import Linter `firebase-sdk-restricted` contract.
* **Authentication boundary:** Billing routes rely on `app.modules.billing.permissions`, which wraps `app.shared.auth` without importing `app.modules.identity` directly, maintaining module independence (`modules-independent` contract).
* **Token verifier wiring:** `app.shared.auth` accesses token verification via `app.shared.container.get_token_verifier()`, which is registered at startup in `app.main:lifespan`.

## Trial Subscription on Registration

When a new tenant registers, the `TenantRegistered` domain event triggers automatic trial subscription creation:

```text
POST /identity/register
   |
   v
emit_tenant_registered(tenant_id, admin_email)
   |
   v (in-process event bus)
billing.create_trial_subscription(tenant_id, admin_email)
   |
   v
Firestore: subscriptions/{tenant_id}
  tenant_id, plan_id: "starter", status: "TRIAL",
  trial_end: now + 14 days, created_at, updated_at
```

* **Idempotency & Concurrency:** Document ID is `tenant_id`. `_create_trial` calls `create()`, which raises `google.api_core.exceptions.AlreadyExists` if the document already exists, guaranteeing no duplicate trials can be created.
* **Failure Isolation:** Any exception during trial creation is caught and logged (`service.py`). It **never** blocks tenant registration.
* **Self-Healing Recovery:** If trial creation failed during registration (e.g. transient Firestore outage), the tenant's first call to `GET /billing/{tenant_id}/subscription` or `POST /billing/{tenant_id}/checkout` automatically provisions the trial (`create_if_missing=True`).

## Plan Catalogue

Default plan tiers defined in `app/modules/billing/plans.py` (configurable via `BILLING_PLANS_JSON`):

| Plan ID | Name | Users | Documents | Crawl Pages (Month) | Messages (Month) | Widget Domains |
|---|---|---|---|---|---|---|
| `starter` (Trial) | Starter | 3 | 10 | 100 | 500 | 1 |
| `professional` | Professional | 10 | 100 | 1,000 | 5,000 | 3 |
| `enterprise` | Enterprise | 100 | 1,000 | 10,000 | 50,000 | 10 |

Configured defaults:
* Trial length: **14 days** (`BILLING_TRIAL_DAYS`, env configurable)
* Past-due grace period: **7 days** (`BILLING_GRACE_DAYS`, env configurable)
* Default trial plan: `starter` (`BILLING_TRIAL_PLAN_ID`, env configurable)

---

## Endpoints

All billing endpoints are mounted under `/api/v1/billing`. Webhook routes are declared prior to `/{tenant_id}/*` routes to prevent path parameter shadowing.

### 1. GET `/api/v1/billing/{tenant_id}/subscription`

Returns current plan definition, active status, entitlement limits, and live usage counters.

* **Auth:** `company_owner` or `company_admin` of the target tenant, or `platform_admin` (`require_billing_access()`).
* **Request Body:** None.
* **Response Data:**
  ```json
  {
    "data": {
      "subscription_id": "tenant-slug-123",
      "tenant_id": "tenant-slug-123",
      "plan_id": "starter",
      "plan_name": "Starter",
      "status": "TRIAL",
      "trial_end": "2026-11-24T12:00:00Z",
      "current_period_end": null,
      "provider": null,
      "limits": {
        "users": 3,
        "documents": 10,
        "crawl_pages": 100,
        "monthly_messages": 500,
        "widget_domains": 1
      },
      "usage": {
        "users": 1,
        "documents": 0,
        "crawl_pages_this_month": 0,
        "monthly_messages_this_month": 0,
        "widget_domains": 1
      },
      "created_at": "2026-11-10T12:00:00Z",
      "cancel_at_period_end": false,
      "access_level": "full"
    },
    "error": null
  }
  ```
* **Additive Response Fields:**
  * `access_level`: `"full"` (widget active, writes enabled) or `"read_only"` (widget off, dashboard reads only).
  * `cancel_at_period_end`: `true` if scheduled to terminate at period end.
* **Effective Status Evaluation:**
  Status is computed dynamically on read without requiring background cron jobs:
  * `TRIAL` with `trial_end <= now` evaluates to `EXPIRED`.
  * `PAST_DUE` with `grace_period_end <= now` evaluates to `SUSPENDED`.
* **Real Usage Metering:**
  Usage values are real counts read from Firestore:
  * `users`: Count of documents in `tenants/{tenant_id}/members`.
  * `documents`: Count of documents in `tenants/{tenant_id}/documents`.
  * `widget_domains`: Sum of `allowed_domains` across tenant widgets in `widgets`.
  * `crawl_pages_this_month`, `monthly_messages_this_month`: Read from `usage_counters/{tenant_id}` under field `{resource}_{YYYY_MM}`.
* **Probing Protection:** A tenant member without a subscription gets one provisioned lazily. A `platform_admin` probing an arbitrary non-existent tenant ID receives 404 `subscription_not_found` and never causes records to be created.
* **Errors:**
  * `401 unauthorized` — Missing or invalid token.
  * `403 permission_denied` — Token tenant does not match URL `{tenant_id}`.
  * `404 subscription_not_found` — No subscription document for tenant.
  * `500 plan_not_found` — Subscription document references a plan missing from catalogue.

---

### 2. POST `/api/v1/billing/{tenant_id}/checkout`

Initiates a checkout session with the selected payment provider and returns a redirect URL.

* **Auth:** `company_owner` of the target tenant ONLY (`require_billing_owner()`). `company_admin` and `platform_admin` are rejected with 403.
* **Request Body:**
  ```json
  {
    "provider": "stripe",
    "plan_id": "professional"
  }
  ```
* **Response Data:**
  ```json
  {
    "data": {
      "checkout_url": "https://checkout.stripe.com/c/pay/cs_test_...",
      "provider": "stripe"
    },
    "error": null
  }
  ```
* **Behavior:**
  * **Double-Checkout Guard:** If `effective_status == ACTIVE` and a paid `provider` is already attached, returns HTTP 409 `subscription_already_active` to prevent double-billing.
  * **Plan Validation:** Target `plan_id` must exist in catalogue and cannot be `TRIAL_PLAN_ID` (returns 400 `invalid_plan`).
  * **Stripe Flow:**
    * Creates or reuses a Stripe Customer using outbound idempotency key `margo-customer-{tenant_id}`.
    * Persists `stripe_customer_id` on the tenant's subscription document.
    * Creates a Stripe Checkout Session in `mode="subscription"` mapping `plan_id` to `STRIPE_PRICE_*`.
    * Client is redirected to `session.url`.
  * **Paystack Flow:**
    * Validates `PAYSTACK_SECRET_KEY` and target plan code (`PAYSTACK_PLAN_*`).
    * Resolves owner email (logged-in owner claim, fallback to `admin_email` on subscription doc).
    * Calls Paystack REST API `POST https://api.paystack.co/transaction/initialize` with `plan: plan_code`, `email`, `callback_url`, and optional `amount` in kobo (`PAYSTACK_AMOUNT_*`).
    * Client is redirected to `authorization_url`.
* **Errors:**
  * `400 invalid_plan` — Plan is unknown or trial plan.
  * `400 invalid_provider` — Provider is not "stripe" or "paystack".
  * `403 permission_denied` — Caller is not the company owner.
  * `404 subscription_not_found` — Subscription record not found.
  * `409 subscription_already_active` — Tenant already has an active paid subscription.
  * `500 tenant_email_missing` — No email available for checkout.
  * `502 paystack_unavailable` / `paystack_error` — Paystack API unreachable or returned an error.
  * `503 stripe_not_configured` / `paystack_not_configured` — Provider keys or prices missing in config.

---

### 3. POST `/api/v1/billing/webhook/stripe`

Public webhook endpoint for Stripe asynchronous lifecycle events.

* **Auth:** None (verified via Stripe cryptographic signature header `stripe-signature`).
* **Header:** `stripe-signature: t=...,v1=...`
* **Signature Verification:** Verified on raw request body bytes via `stripe.Webhook.construct_event`. Missing header returns 400; invalid signature returns 400; unconfigured `STRIPE_WEBHOOK_SECRET` returns 503.
* **Response Data:**
  ```json
  { "data": { "received": true, "outcome": "processed" }, "error": null }
  ```
* **Idempotency & Processing Engine (`webhook_runner.py`):**
  * Handled via `billing_events/stripe__{event_id}`.
  * `run_idempotent` claims the event with a 300s processing lock.
  * Domain writes and the `"status": "processed"` marker commit in **one atomic Firestore batch**.
  * Redeliveries of already processed events return HTTP 200 with `outcome: "duplicate"`.
  * Unhandled event types return HTTP 200 with `outcome: "ignored"`.
  * Handler exceptions mark event `"failed"` and return HTTP 500 `webhook_processing_failed` so Stripe retries.
* **Out-of-Order Protection:** Events compare `event.created` against subscription `last_event_at`. Older events do not overwrite newer subscription states.
* **Handled Stripe Events:**
  * `checkout.session.completed`: Sets `status: ACTIVE`, records `stripe_subscription_id`, `stripe_customer_id`, plan, clears grace period.
  * `invoice.payment_succeeded`: Sets `status: ACTIVE`, renews `current_period_end`, records normalized invoice item.
  * `invoice.payment_failed`: Sets `status: PAST_DUE`, starts 7-day grace period on first failure (never extended by subsequent retries).
  * `customer.subscription.updated`: Syncs `cancel_at_period_end` and `current_period_end`.
  * `customer.subscription.deleted`: Sets `status: CANCELLED`.

---

### 4. POST `/api/v1/billing/webhook/paystack`

Public webhook endpoint for Paystack asynchronous lifecycle events.

* **Auth:** None (verified via HMAC-SHA512 header `x-paystack-signature`).
* **Header:** `x-paystack-signature: <hex_digest>`
* **Signature Verification:** Constant-time verification (`hmac.compare_digest`) on raw request body bytes using `PAYSTACK_SECRET_KEY`. Missing/invalid signature returns 400; unconfigured secret returns 503.
* **Idempotency Key:** Paystack webhooks lack unique event IDs. Idempotency key is deterministically generated by hashing the raw body: `paystack__{event_name}__{sha256(raw_body)[:40]}`. Redeliveries share identical bytes and deduplicate cleanly.
* **Server-to-Server Verification (`charge.success`):**
  * The payload is never trusted alone.
  * On `charge.success`, the backend re-fetches the transaction directly from Paystack: `GET https://api.paystack.co/transaction/verify/{reference}`.
  * Verifies `status == "success"`, verifies plan code against configured plan, and cross-checks payment amount if configured before activating.
* **Handled Paystack Events:**
  * `charge.success`: Server-verified, sets `status: ACTIVE`, `current_period_end` (+1 calendar month clamped to month-end), saves `paystack_customer_code`, records normalized invoice item.
  * `invoice.payment_failed`: Sets `status: PAST_DUE`, starts 7-day grace period.
  * `subscription.not_renew`: Sets `cancel_at_period_end: true`.
  * `subscription.disable`: Sets `status: CANCELLED`.

---

### 5. GET `/api/v1/billing/{tenant_id}/invoices`

Returns normalized invoice and payment history for the tenant, ordered newest first.

* **Auth:** `company_owner` of target tenant ONLY (`require_billing_owner()`).
* **Query Parameters:**
  * `limit`: Clamped integer `1 <= limit <= 100` (default 20).
  * `cursor`: Optional ISO 8601 UTC date string of the last invoice from previous page.
* **Response Data:**
  ```json
  {
    "data": {
      "invoices": [
        {
          "id": "in_1N4...",
          "provider": "stripe",
          "amount_cents": 4900,
          "currency": "usd",
          "status": "paid",
          "date": "2026-11-10T10:00:00Z",
          "description": "Professional Plan",
          "pdf_url": "https://pay.stripe.com/invoice/..."
        }
      ],
      "next_cursor": "2026-11-10T10:00:00Z"
    },
    "error": null
  }
  ```
* **Storage Isolation:** Invoices are stored in subcollections partitioned by tenant: `billing_invoices/{tenant_id}/items/{provider}__{invoice_id}`.
* **Provider Normalization:** Amount is always integer in minor units (`amount_cents`), currency is lowercased ISO 4217, status is normalized (`paid`, `open`, `void`, `failed`). Raw provider payloads are never stored or leaked.
* **Errors:**
  * `400 invalid_cursor` — Malformed cursor string.
  * `401 unauthorized` — Missing or invalid token.
  * `403 permission_denied` — Caller is not the company owner.

---

## Subscription Lifecycle & Lapse Policy

```text
               +---------------------------------------------------+
               |                                                   |
               v                                                   |
[ TRIAL ] ------------> [ ACTIVE ] <------------ [ PAST_DUE ]      |
    |      (checkout)        |     (pay success)       ^           |
    |                        |                         | (fail)    |
    | (trial_end)            | (deleted)               |           |
    v                        v                         |           |
[ EXPIRED ]             [ CANCELLED ] -----------------+-----------+
(READ_ONLY)                  |
                             v (period_end)
                        [ READ_ONLY ]
```

* **Access States:**
  * `FULL`: `TRIAL` (active window), `ACTIVE`, `PAST_DUE` (within 7-day grace period), `CANCELLED` (until `current_period_end`).
  * `READ_ONLY`: `EXPIRED` (trial elapsed), `SUSPENDED` (past-due grace elapsed), `CANCELLED` (after `current_period_end`).
* **Read-Only Enforcement:**
  * Public chat widget is suspended (`is_subscription_active` returns `False`).
  * Dashboard writes (invites, crawl jobs, uploads) are rejected by their respective modules.
  * Dashboard reads, login, subscription details, checkout, and invoice history remain accessible so the tenant can view their account and settle payments.
  * Enforcing `READ_ONLY` at route level is the responsibility of consumer modules via `billing.ports.get_access_level` or `is_subscription_active`.

---

## Entitlement Ports (`app/modules/billing/ports.py`)

The **only** symbols other modules may import from billing:

```python
def is_subscription_active(tenant_id: str) -> bool:
    """Return True if the tenant's subscription permits feature access (FULL access)."""

def is_within_plan_limit(tenant_id: str, resource: str, requested: int = 1) -> bool:
    """Return True if requested units fit within the plan limit. Fails closed."""

def is_within_rate_limit(tenant_id: str, action: str) -> bool:
    """Return True if action is permitted under plan quotas via BILLABLE_ACTIONS."""

def record_usage(tenant_id: str, resource: str, amount: int = 1) -> None:
    """Atomically increment monthly usage counter in Firestore."""

def reserve_usage(tenant_id: str, resource: str, amount: int = 1) -> bool:
    """Check limit and increment counter in ONE Firestore transaction. Concurrency safe."""

def get_access_level(tenant_id: str) -> AccessLevel:
    """Return AccessLevel.FULL or AccessLevel.READ_ONLY. Fails closed."""

def get_usage(tenant_id: str, resource: str) -> int:
    """Return current consumption count for resource."""
```

* **Fail-Closed Guarantee:** Any Firestore read error, missing subscription, unmapped resource, or unknown status returns `False` or `AccessLevel.READ_ONLY`. Callers must treat `False` as "deny access".
* **`BILLABLE_ACTIONS` Registry:**
  * `send_message` -> maps to `LimitedResource.MONTHLY_MESSAGES` ("monthly_messages")
  * `crawl_page` -> maps to `LimitedResource.CRAWL_PAGES` ("crawl_pages")
  * Any unmapped action is automatically denied and logged.
* **Usage Reservation Policy:** Chat and knowledge modules **must** call `reserve_usage()` before executing billable operations to avoid race conditions taking the final unit under concurrent requests.

---

## Firestore Collections Owned by Billing

1. `subscriptions` (Root collection)
   * Document ID: `{tenant_id}`
   * Schema: `tenant_id`, `plan_id`, `status`, `trial_end`, `current_period_end`, `grace_period_end`, `provider`, `stripe_customer_id`, `stripe_subscription_id`, `paystack_customer_code`, `last_event_at`, `created_at`, `updated_at`.
2. `billing_events` (Root collection)
   * Document ID: `{provider}__{event_id}` (Paystack: `paystack__{event}__{sha256[:40]}`)
   * Schema: `provider`, `event_id`, `event_type`, `status` ("processing" \| "processed" \| "failed"), `attempts`, `lock_until`, `received_at`, `processed_at`, `error`.
3. `billing_invoices/{tenant_id}/items` (Subcollection)
   * Document ID: `{provider}__{invoice_id}`
   * Schema: `id`, `tenant_id`, `provider`, `amount_cents`, `currency`, `status`, `date`, `description`, `pdf_url`.
4. `usage_counters` (Root collection)
   * Document ID: `{tenant_id}`
   * Schema: Dynamic monthly fields `{resource}_{YYYY_MM}` (e.g. `monthly_messages_2026_11: 42`).

---

## Known Limitations

1. **Stripe Checkout Session Idempotency:** While Stripe Customer creation uses outbound idempotency keys, `stripe.checkout.Session.create` does not supply one. A tenant double-clicking checkout in two open tabs could generate two open Stripe sessions; the second paid session would not be automatically reconciled.
2. **Usage Aggregation Queries:** Live counting for `users` and `documents` currently executes `.get()` over subcollections and measures length in memory. At production scale, this should transition to Firestore native `.count().get()` aggregation.
3. **Documents Quota Dependency:** Quota enforcement for `documents` reads `tenants/{tenant_id}/documents`, which will be populated by Ticket BE-005.
4. **In-Memory Verification Cooldown:** The 60-second resend cooldown tracker (`_resend_cooldown`) is per-instance in-memory and does not share state across multiple Cloud Run worker instances.
5. **Email Verification Redirect URL:** Firebase email-verification links do not currently append a continue URL pointing back to the frontend login dashboard.
6. **Invited User Re-Invite:** Invited users created before the pre-verified fix was deployed must be removed and re-invited to benefit from upfront email verification.

---

# 12A. Billing Assumptions & Open Decisions

The following defaults are implemented in code and require formal confirmation by the product owner:

| Decision / Area | Current Code Default | Configuration / Code Location | Confirmed By / Notes |
|---|---|---|---|
| **Plan Pricing & Limits** | Starter (Trial), Pro ($49/mo provisional), Enterprise ($199/mo provisional) | `app/modules/billing/plans.py` (`PLANS`, `BILLING_PLANS_JSON`) | Product Owner / Business team |
| **Trial Length & Card Policy** | 14 days; cardless signup (no card required at registration) | `app/core/config.py` (`BILLING_TRIAL_DAYS`) | Product Owner |
| **Past-Due Grace Period** | 7 calendar days before access drops to `SUSPENDED` | `app/core/config.py` (`BILLING_GRACE_DAYS`) | Product Owner / Finance |
| **Lapse Access Policy** | Public widget suspended; dashboard read-only (login, view, checkout allowed) | `app/modules/billing/ports.py` (`get_access_level`) | Product Owner / Security |
| **Billing Interval & Proration** | Monthly intervals; cancellation takes effect at period end; no proration refunds | `paystack_webhooks.py:121-127`, `ports.py:129-133` | Product Owner / Finance |
| **Upgrade / Plan Change Flow** | Blocked if active paid subscription exists (HTTP 409 `subscription_already_active`) | `app/modules/billing/service.py:191-198` | Product Owner (requires Customer Portal or upgrade endpoint) |
| **Currencies & Entities** | Stripe in USD (minor units: cents); Paystack in NGN (minor units: kobo) | `app/core/config.py` (`STRIPE_PRICE_*`, `PAYSTACK_AMOUNT_*`) | Finance / Legal entity |
| **Customer Portal / Cancel Endpoint** | No `/billing/{tenant_id}/cancel` or `/portal` endpoint in API Contract §3.2 | Contract §3.2 omission; cancellation is webhook-driven | Product Owner / Frontend lead |
| **Public Plan Listing Endpoint** | No `GET /billing/plans` endpoint in Contract §3.2; frontend must hardcode catalogue | Contract §3.2 omission | Frontend Lead / Product Owner |

---

---

# 13. Knowledge API

```http
POST   /api/v1/knowledge/{tenant_id}/crawl
GET    /api/v1/knowledge/{tenant_id}/crawl/{job_id}
POST   /api/v1/knowledge/{tenant_id}/documents
GET    /api/v1/knowledge/{tenant_id}/documents
DELETE /api/v1/knowledge/{tenant_id}/documents/{document_id}
```

Internal worker endpoints (Cloud Tasks only, frontend must not call):

```http
POST /api/v1/knowledge/internal/process-page
POST /api/v1/knowledge/internal/process-document
```

---

# 14. Chat API

## WebSocket (Visitor)

```text
wss://<host>/api/v1/chat/ws/{widget_id}
```

The widget domain is validated through the identity module.

## Dashboard

```http
GET /api/v1/chat/{tenant_id}/conversations
GET /api/v1/chat/{tenant_id}/conversations/{conversation_id}
```

---

# 15. Platform API

```http
GET /api/v1/platform/overview
GET /api/v1/platform/{tenant_id}/inspect
GET /api/v1/platform/system-logs
```

All restricted to `platform_admin`.

---

# 16. Frontend Integration Rules

## Rule 1 — Use the API

All data must go through FastAPI. The frontend must not call Firebase directly.

## Rule 2 — Use `/api/v1`

```javascript
const API_BASE_URL = "/api/v1";
```

## Rule 3 — Send Auth Credentials

```http
Authorization: Bearer <token>
```

## Rule 4 — Handle the Standard Envelope

```json
{ "data": {}, "error": null }
{ "data": null, "error": { "code": "...", "message": "...", "details": {} } }
```

## Rule 5 — Do Not Call Internal Endpoints

The frontend must not call `/knowledge/internal/*`.

## Rule 6 — Handle Email Verification Errors (BE-004)

`403 email_not_verified` may occur on any authenticated endpoint for an unverified user:

```json
{
  "data": null,
  "error": {
    "code": "email_not_verified",
    "message": "Email address has not been verified."
  }
}
```

**Frontend behavior on `email_not_verified`:**
- Redirect to email-verification screen.
- Provide a "Resend verification email" button (`POST /identity/resend-verification`).
- Do not continue to the dashboard.

---

# 17. Frontend Responsibilities (BE-004 additions)

### Identity

- Registration UI
- **Email-verification pending screen** (after registration)
- **Resend-verification action** (`POST /identity/resend-verification`)
- Login UI with `email_not_verified` error handling
- Display `display_name` and `company_name` from login and `/me`
- Logout button (`POST /identity/logout`)
- Sign-out-all-devices option (`POST /identity/logout/all`)
- Team management, invitations, widget-domain management

### Billing, Knowledge, Chat, Platform

As previously documented.

---

# 18. Event-Driven Module Communication

```text
TenantRegistered   → Billing creates trial subscription (BE-004)
PageExtracted      → Embedding processes the page
DocumentExtracted  → Embedding processes the document
```

---

# 19. API Quick Reference

| Module | Endpoint | Method | Auth | Purpose |
|---|---|---|---|---|
| Identity | `/identity/register` | POST | None | Register tenant + send verification email |
| Identity | `/identity/resend-verification` | POST | None | Resend email verification link |
| Identity | `/identity/login` | POST | None | Login (requires verified email) |
| Identity | `/identity/forgot-password` | POST | None | Password-reset email |
| Identity | `/identity/me` | GET | Bearer | Current user + company context |
| Identity | `/identity/logout` | POST | Bearer | Sign out current device |
| Identity | `/identity/logout/all` | POST | Bearer | Sign out all devices |
| Identity | `/identity/{tenant_id}/users` | GET | Bearer | List users |
| Identity | `/identity/{tenant_id}/users/invite` | POST | Bearer | Invite user |
| Identity | `/identity/{tenant_id}/users/invite` | GET | Bearer | List pending invites |
| Identity | `/identity/{tenant_id}/users/{user_id}` | DELETE | Bearer | Remove user |
| Identity | `/identity/{tenant_id}/widget-domains` | GET | Bearer | List domains |
| Identity | `/identity/{tenant_id}/widget-domains` | POST | Bearer | Add domain |
| Identity | `/identity/tenants` | GET | Bearer (admin) | List all tenants |
| Identity | `/identity/platform-admins` | POST | Bearer (admin) | Create platform admin |
| Billing | `/billing/{tenant_id}/subscription` | GET | Bearer (owner/admin/platform_admin) | Current plan, status, limits, and live usage |
| Billing | `/billing/{tenant_id}/checkout` | POST | Bearer (owner) | Initiate payment checkout session (Stripe/Paystack) |
| Billing | `/billing/{tenant_id}/invoices` | GET | Bearer (owner) | Normalized invoice history (newest first, paginated) |
| Billing | `/billing/webhook/stripe` | POST | Stripe sig (no user auth) | Stripe webhook event receiver |
| Billing | `/billing/webhook/paystack` | POST | Paystack sig (no user auth) | Paystack webhook event receiver |
| Knowledge | `/knowledge/{tenant_id}/crawl` | POST | Bearer | Start crawl |
| Knowledge | `/knowledge/{tenant_id}/crawl/{job_id}` | GET | Bearer | Crawl status |
| Knowledge | `/knowledge/{tenant_id}/documents` | POST | Bearer | Upload document |
| Knowledge | `/knowledge/{tenant_id}/documents` | GET | Bearer | List documents |
| Knowledge | `/knowledge/{tenant_id}/documents/{document_id}` | DELETE | Bearer | Delete document |
| Chat | `/chat/ws/{widget_id}` | WS | None | Visitor chat |
| Chat | `/chat/{tenant_id}/conversations` | GET | Bearer | List conversations |
| Chat | `/chat/{tenant_id}/conversations/{conversation_id}` | GET | Bearer | Get conversation |
| Platform | `/platform/overview` | GET | Bearer (admin) | Platform overview |
| Platform | `/platform/{tenant_id}/inspect` | GET | Bearer (admin) | Inspect tenant |
| Platform | `/platform/system-logs` | GET | Bearer (admin) | System logs |

All public REST endpoints are prefixed with `/api/v1`.

---

# 20. Development Commands & Test Suite

```bash
# Create virtual environment
python -m venv venv

# Activate (Git Bash)
source venv/Scripts/activate

# Copy env file
cp .env.example .env

# Run server
uvicorn app.main:app --reload --port 3000

# Run full test suite
pytest tests/ -v

# Run import linter
bash lint.sh
```

## Test Suite Architecture

The test suite consists of 200 unit and integration tests executing completely in-memory without requiring live Firebase emulators or external cloud network access.

### Billing Test Files

| Test File | Coverage |
|---|---|
| `tests/test_billing_checkout.py` | POST `/checkout` validation (plan rejection, trial plan rejection, admin 403), Stripe Customer creation, idempotency key checks, customer reuse, and Paystack 503 handling when unconfigured. |
| `tests/test_billing_service.py` | End-to-end service and route tests using `fake_db`: trial creation idempotency, subscription retrieval with `effective_status`, double-checkout active guard (409), Stripe missing header 400 rejection, and invoice listing auth/scoping. |
| `tests/test_billing_webhooks.py` | Stripe & Paystack webhook handlers, signature verification, `webhook_runner.py` atomic batch commits, 300s lock handling, duplicate 200 delivery, out-of-order `last_event_at` drops, grace period start-once logic, Paystack HMAC-SHA512 validation, and Paystack amount cross-checks. |
| `tests/test_billing_subscription.py` | GET `/subscription` authorization (owner/admin/platform_admin, cross-tenant rejection 403), effective status computation, real usage integration, and missing subscription handling. |
| `tests/test_billing_usage.py` | Live usage collection reading (`members`, `documents`, `widgets`), monthly counter formatting `{resource}_{YYYY_MM}`, and monthly counter resets. |
| `tests/test_billing_ports.py` | Public entitlement ports (`is_subscription_active`, `is_within_plan_limit`, `is_within_rate_limit`, `BILLABLE_ACTIONS`), grace period boundaries, and fail-closed security policy. |
| `tests/test_billing_plans.py` | Plan catalogue integrity, default plan limits, and `LimitedResource` schema alignment. |

### Identity Test Files

| Test File | Coverage |
|---|---|
| `tests/test_identity_registration.py` | Tenant registration, widget provisioning, `TenantRegistered` event emission, verification email dispatch, and compensation on failure. |
| `tests/test_identity_login.py` | Firebase sign-in password verification, email verification gating, and tenant context resolution. |
| `tests/test_identity_invited_login.py` | Upfront `email_verified=True` for invited users & platform admins, real `verify_token` execution, 6-character password support, and 403 `email_not_verified` with cooldown-limited resend. |
| `tests/test_identity_verification.py` | Resend verification endpoint (`POST /identity/resend-verification`) and in-memory 60s cooldown. |
| `tests/test_identity_permissions.py` | Hierarchical role checking (`require_role`, `require_tenant_access`). |
| `tests/test_identity_users.py` | Member listing, invitation flows (`POST /users/invite`), pending invite lists, and member removal (`DELETE /users/{user_id}`). |
| `tests/test_identity_widgets.py` | Allowed domain management (`GET/POST /widget-domains`) and normalization. |
| `tests/test_identity_platform.py` | Platform admin endpoints (`/platform-admins`, `/tenants`, `/system-logs`). |
| `tests/test_identity_forgot_password.py` | Password reset dispatch. |

### In-Memory Test Infrastructure

* `tests/fake_firestore.py`: Standalone, in-memory implementation of Firestore clients, collections, document references, queries (`where`, `order_by`, `start_after`, `limit`), batches, and `Increment`. Replicates exact Firestore behaviors (e.g. `create()` raising `AlreadyExists`, atomic batch commits).
* `tests/conftest.py`: Global pytest fixtures including `fake_db`, which registers `FakeDB` into `app.shared.container` and mocks token verification for offline test execution.

## Testing Webhooks Locally

*Note: All live third-party provider interactions are unverified offline and require a test-mode run with real API keys.*

### 1. Stripe Local Webhook Forwarding

Using the [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
# Forward inbound Stripe events to the local FastAPI server
stripe listen --forward-to localhost:3000/api/v1/billing/webhook/stripe
```

* Copy the webhook signing secret printed by the CLI (`whsec_...`) and configure `STRIPE_WEBHOOK_SECRET` in `.env`.
* Mandatory events to forward and test:
  1. `checkout.session.completed`
  2. `invoice.payment_succeeded`
  3. `invoice.payment_failed`
  4. `customer.subscription.updated`
  5. `customer.subscription.deleted`

### 2. Paystack Local Webhook Forwarding

Paystack requires an externally reachable HTTPS callback URL. Use a tunneling utility such as [ngrok](https://ngrok.com/):

```bash
ngrok http 3000
```

* In the [Paystack Dashboard](https://dashboard.paystack.com/) under **Settings > API Keys & Webhooks**, set the **Webhook URL** to:
  `https://<your-ngrok-subdomain>.ngrok.io/api/v1/billing/webhook/paystack`
* Ensure `PAYSTACK_SECRET_KEY` in `.env` matches the Secret Key from the Paystack dashboard so HMAC-SHA512 signature verification succeeds.
* Mandatory test-mode events:
  1. `charge.success`
  2. `invoice.payment_failed`
  3. `subscription.not_renew`
  4. `subscription.disable`

---

# 21. Architecture Validation

Import Linter enforces two mandatory contracts defined in `setup.cfg`:

### Contract 1: Module Independence

```text
Modules must not import each other directly
```

Modules (`identity`, `billing`, `knowledge`, `embedding`, `retrieval`, `agent`, `chat`, `platform`) are strictly decoupled. Cross-module operations must go through `ports.py`, domain events, or approved shared infrastructure.

### Contract 2: Firebase SDK Restriction

```text
Only identity may import the Firebase SDK
```

Non-identity modules are forbidden from importing `app.core.firebase` or `firebase_admin`.

### Shared Container Wiring

To enable billing to verify auth tokens and access Firestore without violating module boundaries or SDK restrictions:
1. `app.main:lifespan` initializes Firebase once at startup.
2. `container.register_db(get_firestore_client())` registers Firestore in `app.shared.container`. Billing calls `container.get_db()`.
3. `container.register_token_verifier(verify_id_token)` registers the token verifier. `app.shared.auth` (used by `billing.permissions`) calls `container.get_token_verifier()`, completely avoiding an import of `app.core.firebase`.

A successful run (`bash lint.sh`) reports:

```text
=============
Import Linter
=============

---------
Contracts
---------

Analyzed 95 files, 124 dependencies.
------------------------------------

Modules must not import each other directly KEPT
Only identity may import the Firebase SDK KEPT

Contracts: 2 kept, 0 broken.
```

---

# 22. Implementation Status

## BE-003 — Identity Foundation (Complete)

- Modular backend structure and Import Linter validation
- Firebase Auth + Firestore integration
- Token verification with `check_revoked=True`
- Role-based authorization
- Tenant creation, widget IDs, invited user management, widget domain management
- Platform admin provisioning

## BE-004 — Dual Payment Provider Billing Engine, Webhooks, Entitlement Ports, & Identity Lifecycle (Complete)

### Billing Module
- **Dual Payment Engine:** Stripe (subscriptions, Checkout Sessions) & Paystack (transactions, plan subscriptions).
- **Checkout API (`POST /billing/{tenant_id}/checkout`):**
  - Owner-only authorization (`require_billing_owner`).
  - Active subscription guard (HTTP 409 `subscription_already_active`).
  - Stripe Customer creation with outbound idempotency key `margo-customer-{tenant_id}`.
  - Paystack transaction initialization with plan code and optional minor unit amount.
- **Webhook Receivers:**
  - `POST /billing/webhook/stripe`: Cryptographic signature verification on raw payload via `stripe.Webhook.construct_event`.
  - `POST /billing/webhook/paystack`: Constant-time HMAC-SHA512 verification (`hmac.compare_digest`) on raw payload.
  - Missing signature header returns 400; unconfigured secret returns 503.
- **Idempotent Atomic Webhook Runner (`webhook_runner.py`):**
  - Event tracking via `billing_events` collection (Stripe event ID; Paystack body hash).
  - 300s processing lock preventing concurrent delivery races; stale lock auto-expiration.
  - Single atomic Firestore write batch committing domain updates and event status together.
  - Retries signaled via HTTP 500 on failure; duplicates return HTTP 200 `outcome: "duplicate"`.
  - Stale event protection dropping out-of-order events using `last_event_at`.
- **Paystack Server-Side Verification:** Re-queries `GET /transaction/verify/{reference}` over HTTPS before activating or renewing.
- **Subscription Lifecycle & Lapse Policy:** State machine (`TRIAL`, `ACTIVE`, `PAST_DUE`, `SUSPENDED`, `CANCELLED`, `EXPIRED`); start-once 7-day grace period; `READ_ONLY` access level enforcement (widget suspended, dashboard read-only).
- **Invoice History (`GET /billing/{tenant_id}/invoices`):**
  - Owner-only authorization.
  - Provider-normalized `InvoiceItem` schema (amounts in integer minor units, lowercase currency).
  - Tenant subcollection partitioning (`billing_invoices/{tenant_id}/items`).
  - Date-descending order and bounded cursor-based pagination.
- **Entitlement Ports (`ports.py`):**
  - Public contract ports: `is_subscription_active`, `is_within_plan_limit`, `is_within_rate_limit`.
  - Additional operational ports: `reserve_usage` (atomic Firestore transaction for concurrency safety), `record_usage` (atomic increment), `get_access_level`, `get_usage`.
  - Strict fail-closed policy (Firestore errors / missing data return `False` / `READ_ONLY`).
  - Billable action registry (`BILLABLE_ACTIONS`) denying unmapped actions.
- **Usage Metering:** Monthly rolling counters `{resource}_{YYYY_MM}` and live entity counts.

### Identity Lifecycle Enhancements
- **Email Verification Gating:** Registration returns `verification_required`; no token issued.
- **Verification Gate Enforcement:** `verify_token` enforces `email_verified=True`; raises `ValueError("email_not_verified...")`.
- **Unverified Login Handling:** `POST /identity/login` catches verification failure, returns HTTP 403 `email_not_verified`, and triggers automatic verification email resend.
- **Resend Cooldown:** 60-second in-memory cooldown prevents verification email spam (`POST /identity/resend-verification` and on login).
- **Pre-Verified Invited Users & Platform Admins:** Invited members (`invite_user`) and platform admins (`create_platform_admin`) are created with `email_verified=True` up front since the set-password email serves as proof of ownership.
- **Flexible Login Password Length:** `LoginRequest` accepts passwords from 1 to 128 characters, maintaining compatibility with Firebase's hosted 6-character set-password page.
- **Admin Promotion CLI:** `scripts/bootstrap_platform_admin.py` includes `--mark-verified` and guards against promoting unverified accounts without confirmation.
- **Session Termination:** `POST /identity/logout` (current device) and `POST /identity/logout/all` (refresh-token revocation across all devices).

### Test Suite Results
- **200 passed, 0 failed, 1 warning** across 16 test files in 18.52s.
- Import Linter: **2 kept, 0 broken**.

---

# 23. Environment Configuration

| Variable | Purpose | Required / Default |
|---|---|---|
| `ENV` | Application environment (`development` \| `production`) | Default: `development` |
| `ALLOWED_ORIGINS` | CORS allowed origins JSON array | Required |
| `FIREBASE_PROJECT_ID` | Firebase project identifier | Required |
| `FIREBASE_WEB_API_KEY` | Client-facing Web API key (Identity Toolkit REST) | Required |
| `FIREBASE_CREDENTIALS_PATH` | Service account JSON path (local dev only) | Local dev only |
| `FIREBASE_AUTH_EMULATOR_HOST` | Auth emulator host (e.g. `localhost:9099`) | Unset in production |
| `FIRESTORE_EMULATOR_HOST` | Firestore emulator host (e.g. `localhost:8080`) | Unset in production |
| **Billing Configuration** | | |
| `BILLING_TRIAL_DAYS` | Length of initial trial in calendar days | Default: `14` |
| `BILLING_GRACE_DAYS` | Grace period length for past-due subscriptions in days | Default: `7` |
| `BILLING_TRIAL_PLAN_ID` | Default plan ID provisioned on registration | Default: `starter` |
| `BILLING_PLANS_JSON` | Optional JSON string overriding entire plan catalogue | Optional (e.g. `{"starter": {"name": "Starter", "limits": {...}}}`) |
| `STRIPE_SECRET_KEY` | Stripe API secret key (`sk_test_...` / `sk_live_...`) | Required for Stripe (503 if unset) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook endpoint signing secret (`whsec_...`) | Required for Stripe webhooks (503 if unset) |
| `STRIPE_PRICE_PROFESSIONAL` | Stripe Price ID for Professional plan | Required for Stripe Pro checkout |
| `STRIPE_PRICE_ENTERPRISE` | Stripe Price ID for Enterprise plan | Required for Stripe Enterprise checkout |
| `STRIPE_SUCCESS_URL` | Redirect URL after completed Stripe checkout | Default: `http://localhost:3000/billing/success` |
| `STRIPE_CANCEL_URL` | Redirect URL if Stripe checkout is cancelled | Default: `http://localhost:3000/billing/cancel` |
| `PAYSTACK_SECRET_KEY` | Paystack secret key (`sk_test_...` / `sk_live_...`) | Required for Paystack (503 if unset) |
| `PAYSTACK_PLAN_PROFESSIONAL` | Paystack Plan Code for Professional plan | Required for Paystack Pro checkout |
| `PAYSTACK_PLAN_ENTERPRISE` | Paystack Plan Code for Enterprise plan | Required for Paystack Enterprise checkout |
| `PAYSTACK_CALLBACK_URL` | Redirect URL after completed Paystack checkout | Default: `http://localhost:3000/billing/success` |
| `PAYSTACK_AMOUNT_PROFESSIONAL`| Pro plan price in minor units (kobo for NGN) | Optional (0 = unconfigured) |
| `PAYSTACK_AMOUNT_ENTERPRISE`  | Enterprise plan price in minor units (kobo for NGN)| Optional (0 = unconfigured) |

In production on Cloud Run, service account credentials are injected automatically via the environment. Provider keys and secrets must be injected via Secret Manager.

---

# 24. Source of Truth

The **Margo API Contract** and **Margo Backend Tickets** are the primary references. The implementation follows the contract's architectural boundaries. Where ticket descriptions conflict with the contract, the conflict is identified and resolved explicitly before implementation.

---

# 25. Frontend Integration Summary

```text
Frontend
   |
   | REST / WebSocket
   v
Margo FastAPI
   |
   +--> Identity (auth, users, sessions)
   +--> Billing  (subscriptions, payments)
   +--> Knowledge (documents, crawls)
   +--> Chat (visitor widget, dashboard)
   +--> Platform (admin console)
   |
   v
Firebase
```

### The frontend should:

- Communicate with FastAPI via `/api/v1`
- Send `Authorization: Bearer <token>` on authenticated requests
- Handle `email_not_verified` (403) by showing a verification screen
- Show a verification-pending screen after registration
- Provide a resend-verification button
- Use `POST /identity/logout` for current-device sign-out
- Use `POST /identity/logout/all` for all-device revocation
- Display `company_name` and `display_name` from login and `/me`
- Use the WebSocket for visitor conversations
- Poll knowledge-processing jobs

### The frontend must not:

- Call Firestore or Firebase Auth directly
- Call internal knowledge-processing endpoints
- Enforce security solely through frontend logic
- Trust client-side `role`, `tenant_id`, or `company_name` for access control decisions
