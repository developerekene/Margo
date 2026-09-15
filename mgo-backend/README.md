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
- approved shared infrastructure

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
│   └── __init__.py
│
├── .env.example
├── Dockerfile
├── lint.sh
├── requirements.txt
├── requirements-dev.txt
├── setup.cfg
└── README.md
```

The module directories follow the same basic structure so that implementation can be added consistently as development progresses.

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

### Important Authentication Note

The existing project documents contain conflicting descriptions around whether the frontend should use the Firebase Auth Client SDK directly.

For the architectural rule adopted by this README:

> **Frontend → FastAPI → Firebase**

the frontend must not directly call Firebase Auth.

The exact implementation of the login endpoint should therefore follow the final backend authentication decision made during implementation.

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

The frontend should build API requests from this base URL rather than hard-coding individual production domains.

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

The frontend should treat `next_cursor` as an opaque value and should not attempt to interpret it.

---

## 10. Date and Time Format

API timestamps use:

```text
ISO 8601 UTC
```

Example:

```text
2026-09-15T12:30:00Z
```

---

# 11. Identity API

Identity manages:

- tenant registration
- users
- roles
- permissions
- invitations
- widget domains
- platform administrators

## Endpoints

### Register Tenant

```http
POST /api/v1/identity/register
```

Creates a tenant and its initial owner.

The operation publishes the `TenantRegistered` event.

### Login

```http
POST /api/v1/identity/login
```

Authentication/login behavior must follow the final backend authentication implementation.

### Get Current User

```http
GET /api/v1/identity/me
```

Requires authentication.

### List Tenant Users

```http
GET /api/v1/identity/{tenant_id}/users
```

Allowed for:

- tenant owner
- tenant admin
- platform admin

### Invite User

```http
POST /api/v1/identity/{tenant_id}/users/invite
```

Tenant owner/admin can invite users and assign supported roles.

### Remove User

```http
DELETE /api/v1/identity/{tenant_id}/users/{user_id}
```

### List Widget Domains

```http
GET /api/v1/identity/{tenant_id}/widget-domains
```

### Register Widget Domain

```http
POST /api/v1/identity/{tenant_id}/widget-domains
```

### List Tenants

```http
GET /api/v1/identity/tenants
```

Platform-admin only.

### Create Platform Admin

```http
POST /api/v1/identity/platform-admins
```

Platform-admin only.

---

# 12. Billing API

Billing manages:

- subscriptions
- plans
- checkout
- payment providers
- invoices
- subscription limits

## Endpoints

### Get Subscription

```http
GET /api/v1/billing/{tenant_id}/subscription
```

### Create Checkout

```http
POST /api/v1/billing/{tenant_id}/checkout
```

Supported providers:

```text
stripe
paystack
```

### Stripe Webhook

```http
POST /api/v1/billing/webhook/stripe
```

### Paystack Webhook

```http
POST /api/v1/billing/webhook/paystack
```

### List Invoices

```http
GET /api/v1/billing/{tenant_id}/invoices
```

### Billing Ports

The billing module exposes capabilities such as:

- `is_subscription_active`
- `is_within_plan_limit`
- `is_within_rate_limit`

---

# 13. Knowledge API

Knowledge manages the information used by Margo's AI system.

Supported sources include:

- website crawling
- Markdown documents
- PDF documents

## Start Website Crawl

```http
POST /api/v1/knowledge/{tenant_id}/crawl
```

Returns a `job_id`.

## Get Crawl Status

```http
GET /api/v1/knowledge/{tenant_id}/crawl/{job_id}
```

Expected processing states include:

```text
queued
extracting
embedding
completed
failed
```

## Upload Document

```http
POST /api/v1/knowledge/{tenant_id}/documents
```

Supported document types include:

- PDF
- Markdown

Returns a `document_id` and processing status.

## List Documents

```http
GET /api/v1/knowledge/{tenant_id}/documents
```

## Delete Document

```http
DELETE /api/v1/knowledge/{tenant_id}/documents/{document_id}
```

---

# 14. Internal Knowledge Endpoints

The following endpoints are internal worker endpoints and are **not frontend endpoints**.

### Process Website Page

```http
POST /api/v1/knowledge/internal/process-page
```

### Process Document

```http
POST /api/v1/knowledge/internal/process-document
```

These endpoints are intended for Cloud Tasks execution and require the appropriate service-to-service authentication.

The frontend must never call them directly.

---

# 15. Embedding Module

The embedding module has no public HTTP endpoints.

It handles embedding-related processing and uses Firestore's native vector search capability.

It exposes internal capabilities through its ports.

It subscribes to knowledge-processing events such as:

```text
PageExtracted
DocumentExtracted
```

---

# 16. Retrieval Module

The retrieval module has no public HTTP endpoints.

Its main responsibility is obtaining relevant context for the agent.

It exposes functionality through:

```text
get_context(...)
```

The retrieval module should remain independent from the public API layer.

---

# 17. Agent Module

The agent module has no public HTTP endpoints.

It is responsible for generating AI responses using Gemini and retrieved knowledge.

It exposes functionality through:

```text
generate_reply(...)
```

The agent should not be called directly by the frontend.

The frontend communicates with the chat API instead.

---

# 18. Chat API

Chat is the visitor-facing orchestration layer.

The chat system supports:

- website visitors
- AI responses
- streaming
- conversations
- conversation history
- citations

## WebSocket

```text
wss://<host>/api/v1/chat/ws/{widget_id}
```

The widget domain is validated through the identity module.

### Initial Client Message

```json
{
  "conversation_id": null,
  "message": "What are your office hours?"
}
```

An existing conversation can provide its conversation ID:

```json
{
  "conversation_id": "existing-id",
  "message": "Can you tell me more?"
}
```

### Token Event

The server streams response tokens:

```json
{
  "type": "token",
  "content": "We're"
}
```

### Completion Event

```json
{
  "type": "done",
  "conversation_id": "abc123",
  "sources": [
    {
      "title": "Hours",
      "url": "https://company.com/hours"
    }
  ]
}
```

### Error Event

```json
{
  "type": "error",
  "code": "subscription_inactive",
  "message": "This agent is currently unavailable."
}
```

If `conversation_id` is `null`, the backend generates a conversation ID.

The widget should store the returned conversation ID locally and reuse it until the conversation expires.

---

# 19. Conversation Dashboard API

## List Conversations

```http
GET /api/v1/chat/{tenant_id}/conversations
```

## Get Conversation

```http
GET /api/v1/chat/{tenant_id}/conversations/{conversation_id}
```

These endpoints are intended for the authenticated tenant dashboard.

---

# 20. Platform API

Platform endpoints are restricted to platform administrators.

## Platform Overview

```http
GET /api/v1/platform/overview
```

## Inspect Tenant

```http
GET /api/v1/platform/{tenant_id}/inspect
```

## System Logs

```http
GET /api/v1/platform/system-logs
```

---

# 21. Frontend Integration Rules

The frontend should follow these rules.

## Rule 1 — Use the API

All application data should be accessed through:

```text
FastAPI
```

The frontend should not access Firebase directly.

## Rule 2 — Use `/api/v1`

Example:

```javascript
const API_BASE_URL = "/api/v1";
```

Requests should then follow:

```text
/api/v1/identity/...
/api/v1/billing/...
/api/v1/knowledge/...
/api/v1/chat/...
/api/v1/platform/...
```

## Rule 3 — Send Authentication Credentials

Authenticated requests should include:

```http
Authorization: Bearer <token>
```

## Rule 4 — Handle the Standard Envelope

The frontend API wrapper should understand:

```json
{
  "data": {},
  "error": null
}
```

and:

```json
{
  "data": null,
  "error": {
    "code": "...",
    "message": "...",
    "details": {}
  }
}
```

## Rule 5 — Do Not Call Internal Endpoints

The frontend must not call:

```text
/knowledge/internal/*
```

These are backend/Cloud Tasks endpoints.

## Rule 6 — WebSocket for Visitor Chat

The embedded visitor widget uses:

```text
wss://<host>/api/v1/chat/ws/{widget_id}
```

It should support:

- streamed tokens
- completion events
- error events
- conversation IDs
- citations
- reconnect behavior

---

# 22. Frontend Responsibilities

The frontend is responsible for presenting and consuming the backend API.

## Identity

The frontend should provide:

- registration UI
- login UI
- current-user information
- tenant dashboard
- team/user management
- user invitation
- user removal
- widget-domain management

## Billing

The frontend should provide:

- plan display
- checkout initiation
- provider selection
- subscription status
- invoice list
- subscription badges

## Knowledge

The frontend should provide:

- website URL input
- crawl initiation
- crawl-status polling
- document upload
- document processing status
- document listing
- document deletion

## Chat Widget

The frontend widget should:

- connect to the WebSocket
- send visitor messages
- receive streamed tokens
- maintain the conversation ID
- render Markdown
- render citations
- reconnect when appropriate

## Chat Dashboard

The dashboard should provide:

- conversation list
- conversation details
- transcript viewing

## Platform Console

Platform administrators should have:

- platform overview
- tenant inspection
- system-log access

---

# 23. Hosting Architecture

The production architecture uses:

```text
Firebase Hosting
        |
        | /api/*
        v
Google Cloud Run
        |
        v
Margo FastAPI
        |
        +------------------+
        |                  |
        v                  v
Firebase Auth          Firestore
```

The frontend is hosted as a static application through Firebase Hosting.

The `/api/**` route is rewritten to the Cloud Run backend.

---

# 24. Background Processing

Long-running knowledge-processing work should not block normal API requests.

The architecture uses:

```text
Frontend
   |
   v
FastAPI
   |
   | create job
   v
Cloud Tasks
   |
   v
Internal backend endpoint
   |
   v
Knowledge processing
   |
   +--> extraction
   |
   +--> embedding
   |
   +--> Firestore
```

Cloud Tasks handles durable background execution.

The frontend should poll the public job-status endpoint rather than attempting to execute processing itself.

---

# 25. Event-Driven Module Communication

Important events include:

```text
TenantRegistered
PageExtracted
DocumentExtracted
```

Example:

```text
Identity
   |
   | TenantRegistered
   v
Billing
```

and:

```text
Knowledge
   |
   | PageExtracted / DocumentExtracted
   v
Embedding
```

Events allow modules to remain decoupled.

---

# 26. Multi-Tenancy

Margo is a multi-tenant system.

Tenant-specific resources must be scoped to the appropriate tenant.

Examples include:

- users
- widget domains
- subscriptions
- invoices
- knowledge documents
- crawl jobs
- conversations

The backend is responsible for enforcing tenant isolation.

The frontend must not attempt to enforce tenant security by itself.

---

# 27. Authorization

Roles include tenant-level and platform-level permissions.

The identity module is responsible for permission-related capabilities.

Example hierarchy:

```text
platform_admin
      |
    owner
      |
    admin
      |
   member
```

Actual permission checks must be enforced by the backend.

Frontend role information should only control UI visibility and should never be treated as the security boundary.

---

# 28. Rate Limiting

The architecture uses multiple layers of rate limiting.

Cloud Armor can provide protection for public traffic such as:

- registration
- login
- WebSocket traffic

Firestore counters are used for application-level limits such as:

- per-conversation limits
- tenant plan limits

Billing webhooks are exempt from normal user-facing rate limits.

---

# 29. API Quick Reference

| Module | Endpoint | Method | Purpose |
|---|---|---:|---|
| Identity | `/identity/register` | POST | Register tenant |
| Identity | `/identity/login` | POST | Login |
| Identity | `/identity/me` | GET | Current user |
| Identity | `/identity/{tenant_id}/users` | GET | List users |
| Identity | `/identity/{tenant_id}/users/invite` | POST | Invite user |
| Identity | `/identity/{tenant_id}/users/{user_id}` | DELETE | Remove user |
| Identity | `/identity/{tenant_id}/widget-domains` | GET | List domains |
| Identity | `/identity/{tenant_id}/widget-domains` | POST | Add domain |
| Billing | `/billing/{tenant_id}/subscription` | GET | Subscription |
| Billing | `/billing/{tenant_id}/checkout` | POST | Checkout |
| Billing | `/billing/{tenant_id}/invoices` | GET | Invoices |
| Knowledge | `/knowledge/{tenant_id}/crawl` | POST | Start crawl |
| Knowledge | `/knowledge/{tenant_id}/crawl/{job_id}` | GET | Crawl status |
| Knowledge | `/knowledge/{tenant_id}/documents` | POST | Upload document |
| Knowledge | `/knowledge/{tenant_id}/documents` | GET | List documents |
| Knowledge | `/knowledge/{tenant_id}/documents/{document_id}` | DELETE | Delete document |
| Chat | `/chat/ws/{widget_id}` | WS | Visitor chat |
| Chat | `/chat/{tenant_id}/conversations` | GET | List conversations |
| Chat | `/chat/{tenant_id}/conversations/{conversation_id}` | GET | Get conversation |
| Platform | `/platform/overview` | GET | Platform overview |
| Platform | `/platform/{tenant_id}/inspect` | GET | Inspect tenant |
| Platform | `/platform/system-logs` | GET | System logs |

All public REST endpoints are prefixed with:

```text
/api/v1
```

---

# 30. Development Commands

## Create Virtual Environment

```bash
python -m venv venv
```

## Activate on Git Bash

```bash
source venv/Scripts/activate
```

## Copy Environment File

```bash
cp .env.example .env
```

## Run FastAPI

```bash
uvicorn app.main:app --reload --port 3000
```

Default development address:

```text
http://127.0.0.1:3000
```

## Run Import Linter

```bash
bash lint.sh
```

or:

```bash
lint-imports
```

---

# 31. Architecture Validation

Import Linter is used to enforce module independence.

The architecture contract is:

```text
Modules must not import each other directly
```

A successful validation should report:

```text
Modules must not import each other directly KEPT
Contracts: 1 kept, 0 broken.
```

The backend structural setup has been validated with Import Linter.

---

# 32. Current Structural Status

The current backend setup establishes the architecture without adding business logic prematurely.

Completed structural work includes:

- modular backend directory structure
- module `__init__.py` files
- core package structure
- shared package structure
- top-level API router
- `/api/v1` API prefix
- standard response infrastructure placeholders
- environment configuration structure
- Import Linter configuration
- module-independence validation
- FastAPI application entry point
- module router composition

Placeholder files such as:

```text
app/shared/container.py
app/shared/event_bus.py
```

can remain intentionally empty until their actual implementations are required.

The goal at this stage is to establish stable architectural boundaries before implementing business logic.

---

# 33. Source of Truth

For API and architecture decisions, the **Margo API Contract & Architecture Blueprint** is the primary architectural reference.

The implementation should follow the contract's architectural boundaries rather than introducing frontend/backend shortcuts that would create coupling later.

Where the existing ticket descriptions conflict with the architectural contract, the final implementation decision should be explicitly agreed upon before implementation.

---

# 34. Frontend Integration Summary

The frontend developer should think of Margo as:

```text
Frontend
   |
   | REST / WebSocket
   v
Margo FastAPI
   |
   +--> Identity
   +--> Billing
   +--> Knowledge
   +--> Chat
   +--> Platform
   |
   v
Firebase
```

### The frontend should:

- communicate with FastAPI
- use `/api/v1`
- send the required authorization header
- consume the standard response envelope
- use the chat WebSocket for visitor conversations
- poll knowledge-processing jobs
- display backend authorization state
- maintain visitor conversation IDs locally

### The frontend should not:

- call Firestore directly
- call Firebase Auth directly
- bypass the API
- call Cloud Tasks endpoints
- call internal knowledge-processing endpoints
- enforce security solely through frontend logic

This separation keeps the frontend decoupled from Firebase and allows the backend architecture to evolve without requiring direct Firebase access from the browser.
