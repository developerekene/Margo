"""Firestore collection paths and field constants for the knowledge module.

Centralised here so a path change is a one-line edit with no logic to update.
"""

# ---------------------------------------------------------------------------
# Firestore collections
# ---------------------------------------------------------------------------

# tenants/{tenant_id}/documents/{document_id}
# This path is intentional: billing already counts documents from this
# sub-collection (billing/ports.py:_get_current_usage), so we share it.
DOCUMENTS_SUBCOLLECTION = "documents"

# tenants/{tenant_id}/crawl_jobs/{job_id}
CRAWL_JOBS_SUBCOLLECTION = "crawl_jobs"

# tenants/{tenant_id}/crawl_jobs/{job_id}/pages/{page_id}
PAGES_SUBCOLLECTION = "pages"

TENANTS_COLLECTION = "tenants"
WIDGETS_COLLECTION = "widgets"

# ---------------------------------------------------------------------------
# GCS storage path template
# tenants/{tenant_id}/documents/{document_id}/original
# ---------------------------------------------------------------------------

GCS_OBJECT_TEMPLATE = "tenants/{tenant_id}/documents/{document_id}/original"
