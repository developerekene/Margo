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
│   │   │   ├── events.py
│   │   │   ├── permissions.py
│   │   │   ├── plans.py
│   │   │   ├── ports.py
│   │   │   ├── schemas.py
│   │   │   └── service.py
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
│   ├── test_billing_plans.py
│   ├── test_identity_forgot_password.py
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
Status is flipped from `"invited"` to `"active"`. `email_verified` is set to `true` via Admin SDK — invited users set their password through a password-reset link which does not automatically set `email_verified` in Firebase. The backend acts as trusted verifier.

**Platform admin behavior on first login:**
Same trusted-verifier pattern — `email_verified` set to `true` via Admin SDK on first login.

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
Firebase does not automatically set `email_verified=true` for the password-reset flow. The backend marks `email_verified=true` via Admin SDK on the invitee's first successful login. Until then, `email_verified=false` and they cannot access protected endpoints.

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
`email_verified` is set to `true` via Admin SDK on first login (trusted-verifier pattern). Platform admins have no `tenant_id` claim and `company_name` is `null` in all responses.

| Error code | HTTP | Meaning |
|---|---|---|
| `email_already_registered` | 409 | Email already exists |
| `platform_admin_creation_failed` | 500 | Post-user step failed; Auth user deleted |

> **Bootstrap:** To create the **first** platform admin:
> ```bash
> python scripts/bootstrap_platform_admin.py --email admin@platform.example
> ```

---

# 12. Billing API (BE-004)

Billing manages subscriptions, plans, checkout, payment providers, invoices, and subscription limits.

## Trial Subscription on Registration (BE-004)

When a new tenant registers, the `TenantRegistered` domain event triggers automatic trial subscription creation.

```text
POST /identity/register
   |
   v
emit_tenant_registered(tenant_id, admin_email)
   |
   v (event bus)
billing.create_trial_subscription(tenant_id, admin_email)
   |
   v
Firestore: subscriptions/{subscription_id}
  tenant_id, plan_id: "starter", status: "TRIAL",
  trial_end: now + 14 days
```

**Idempotency:** If a subscription already exists for the tenant, the handler is a no-op.

**Billing failure isolation:** A failure during trial creation does not block registration. The error is logged for alerting.

**Access timing:** The trial is created at registration, but is inaccessible until the user verifies their email.

## Plan Catalogue

| Plan | Users | Documents | Crawl Pages | Monthly Messages | Widget Domains |
|---|---|---|---|---|---|
| `starter` (Trial) | 3 | 10 | 100 | 500 | 1 |
| `professional` | 10 | 100 | 1,000 | 5,000 | 3 |
| `enterprise` | 100 | 1,000 | 10,000 | 50,000 | 10 |

Trial length: **14 days**.

## Subscription Status Lifecycle

```text
TRIAL     → ACTIVE     (successful payment)
ACTIVE    → PAST_DUE   (payment failure)
PAST_DUE  → ACTIVE     (recovered within 7-day grace period)
PAST_DUE  → SUSPENDED  (grace period elapsed)
           → CANCELLED  (cancelled by tenant)
           → EXPIRED
```

Statuses with feature access: `TRIAL`, `ACTIVE`, `PAST_DUE` (within grace period).

## Architectural Rule: Billing Cannot Import Firebase

Billing accesses Firestore through the shared service locator:

```python
from app.shared.container import get_db
db = get_db()
```

Enforced by the Import Linter `firebase-sdk-restricted` contract.

## Endpoints

```http
GET  /api/v1/billing/{tenant_id}/subscription
POST /api/v1/billing/{tenant_id}/checkout
GET  /api/v1/billing/{tenant_id}/invoices
POST /api/v1/billing/webhook/stripe
POST /api/v1/billing/webhook/paystack
```

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
| Billing | `/billing/{tenant_id}/subscription` | GET | Bearer | Get subscription |
| Billing | `/billing/{tenant_id}/checkout` | POST | Bearer | Create checkout |
| Billing | `/billing/{tenant_id}/invoices` | GET | Bearer | List invoices |
| Billing | `/billing/webhook/stripe` | POST | Stripe sig | Stripe webhook |
| Billing | `/billing/webhook/paystack` | POST | Paystack sig | Paystack webhook |
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

# 20. Development Commands

```bash
# Create virtual environment
python -m venv venv

# Activate (Git Bash)
source venv/Scripts/activate

# Copy env file
cp .env.example .env

# Run server
uvicorn app.main:app --reload --port 3000

# Run tests
pytest tests/ -v

# Run import linter
bash lint.sh
```

---

# 21. Architecture Validation

Import Linter enforces two mandatory contracts:

### Contract 1: Module Independence

```text
Modules must not import each other directly
```

### Contract 2: Firebase SDK Restriction

```text
Only identity may import the Firebase SDK
```

All other modules access Firestore through `app.shared.container.get_db()`.

A successful run reports:

```text
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

## BE-004 — Identity, Email Verification, Logout, and Billing Integration (Complete)

### Identity

- **Email verification gating** — registration returns `verification_required`; no token issued
- **Verification enforcement** — `verify_token` checks `email_verified`; raises 403 for unverified users across all protected endpoints
- **Resend-verification** — `POST /identity/resend-verification` with 60s per-email rate limit
- **Company context** — `company_name` and `display_name` in both login and `/me` responses
- **Logout (current device)** — `POST /identity/logout`; client-side token discard; limitation documented
- **Logout (all devices)** — `POST /identity/logout/all`; Firebase refresh-token revocation; enforced at next validation
- **Invited user verification** — `email_verified=True` set via Admin SDK on first login (trusted verifier pattern)
- **Platform admin verification** — same trusted-verifier pattern; no tenant claim

### Billing

- **Trial subscription on registration** — `TenantRegistered` event triggers `create_trial_subscription`
- **Idempotent trial creation** — no duplicate trials
- **Billing failure isolation** — trial failure logged; does not block registration
- **Import boundary** — billing uses `container.get_db()`, never `firebase_admin`
- **Plan catalogue** — `starter`, `professional`, `enterprise` defined in `billing/plans.py`

### Architecture

- Both Import Linter contracts (`modules-independent`, `firebase-sdk-restricted`) maintained
- Event bus and shared container wired at application startup

---

# 23. Environment Configuration

| Variable | Purpose |
|---|---|
| `FIREBASE_PROJECT_ID` | Firebase project identifier |
| `FIREBASE_WEB_API_KEY` | Client-facing API key (Identity Toolkit REST) |
| `FIREBASE_CREDENTIALS_PATH` | Service account JSON path (local dev only) |
| `FIREBASE_AUTH_EMULATOR_HOST` | Auth emulator (e.g. `localhost:9099`), unset in production |
| `FIRESTORE_EMULATOR_HOST` | Firestore emulator (e.g. `localhost:8080`), unset in production |
| `ALLOWED_ORIGINS` | CORS allowed origins |

In production on Cloud Run, no credentials file is needed — the attached service account is used automatically.

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
