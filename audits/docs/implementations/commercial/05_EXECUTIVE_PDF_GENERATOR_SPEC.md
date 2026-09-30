# Executive PDF Report Generator — Implementation Specification

**Document ID:** IZ-COMM-05  
**Classification:** Technical Specification / Executive Reporting & PDF Generation  
**Status:** Implementado  
**Source of Truth:** `backend/app/api/v1/audits.py`, `backend/app/reports/dossier.py`, `backend/app/reports/pdf.py`, `frontend/src/components/modals/PostMortemModal.tsx`

---

## 1. System Objective

Provide formal executive and regulatory reporting for concluded incidents by rendering a boardroom-ready PDF document alongside the markdown post-mortem. Both formats, along with the AI Auditor defense interview, are strictly grounded in the unified incident dossier (`_build_incident_dossier()`), guaranteeing that all three representations share identical, point-in-time factual data.

---

## 2. Technical Dependencies & Architecture

- **Dependency:** `reportlab` in `backend/requirements.txt`. Pure-Python PDF generation with zero external C/binary dependencies or headless browser overhead.
- **Unified Fact Model (`_build_incident_dossier`):** Located in `backend/app/reports/dossier.py`. Gathers immutable point-in-time facts (`tech_debt_at_creation`, `tech_debt_at_resolution`, `accrued_surcharge`, exact audit log timeline) directly from the database. It explicitly avoids using the live session's current cash or current tech debt to represent historical incident impact.

---

## 3. REST Endpoint

`GET /api/audits/postmortem/{incident_id}/export-pdf`
- Generates a PDF in-memory and returns `Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="postmortem_{incident_id}.pdf"'})`.
- Emits no state-mutating side effects.

---

## 4. Document Layout & Structure

The executive layout is structured into six functional blocks:
1. **Header Block:** IncidentZero formal banner, classification watermark, incident ID, title, severity, and service node.
2. **Executive Summary:** Incident timeline, root cause narrative (omitted if unconfirmed at time of resolution), MTTA, and MTTR.
3. **Point-in-Time Technical Debt & Financial Accounting:** Displays exact `tech_debt_at_creation` and `tech_debt_at_resolution`, along with actual `accrued_surcharge` and runbook execution costs.
4. **Audit Trail Chronology:** Chronological list of persisted audit ledger events associated with the incident window (`INCIDENT_RAISED`, `INCIDENT_ACKNOWLEDGED`, `INVESTIGATION_STARTED`, `ROOT_CAUSE_IDENTIFIED`, `RUNBOOK_EXECUTED`).
5. **Regulatory & Compliance Summary:** Flags any SLA breaches or unattended alert violations during the active window.
6. **Content Checksum Seal:**
   - Visual verification badge containing a SHA-256 digest computed from the incident's immutable facts (ID, timestamps, root cause).
   - **Governance Designation:** Formally documented as a **content checksum** for detecting accidental payload corruption or content tampering. It does **not** constitute a cryptographic digital signature or PKI-based authenticity guarantee, as anyone with access can recompute the hash.

---

## 5. UI Integration

- `PostMortemModal.tsx` provides an "Export Official PDF" download button linking directly to the GET endpoint. The browser initiates native download without client-side state mutation.
