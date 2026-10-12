from app.shared.event_bus import publish


def emit_tenant_registered(tenant_id: str, admin_email: str):
    publish("TenantRegistered", tenant_id=tenant_id, admin_email=admin_email)
