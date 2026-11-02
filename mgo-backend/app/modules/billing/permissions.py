"""Billing-specific FastAPI authentication dependencies.

Wraps app.shared.auth with the access rules defined in the API Contract §3.2.
Importing from app.shared.auth (not from app.modules.identity) keeps this
module within the import-linter independence boundary.
"""

from app.shared.auth import require_tenant_access


def require_billing_access():
    """Dependency for subscription reads and invoice history.

    Allows: company_owner or company_admin of own tenant, or platform_admin.
    Contract §3.2: GET /subscription and GET /invoices — owner/admin or
    platform_admin.
    """
    return require_tenant_access(
        roles=["company_owner", "company_admin"],
        allow_platform_admin=True,
    )


def require_billing_owner():
    """Dependency for checkout initiation.

    Allows: company_owner of own tenant only.
    Contract §3.2: POST /checkout — owner only, not admin.
    """
    return require_tenant_access(
        roles=["company_owner"],
        allow_platform_admin=False,
    )
