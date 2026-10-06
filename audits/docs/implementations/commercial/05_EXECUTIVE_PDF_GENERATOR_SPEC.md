# Executive PDF Report Generator — Implementation Specification

**Document ID:** IZ-COMM-05  
**Classification:** Technical Specification / Executive Reporting & PDF Generation  
**Status:** Implementado e verificado contra o código (Outubro 2026)  
**Last Updated:** Outubro 2026  
**Source of Truth:** `backend/app/api/v1/audits.py` (`_build_incident_dossier`, `export_postmortem_pdf`, `_build_postmortem_pdf`; there is no `backend/app/reports/` package), `frontend/src/components/modals/PostMortemModal.tsx`, `frontend/src/services/api.ts`

---

## 1. System Objective

Provide formal executive and regulatory reporting for concluded incidents by rendering a boardroom-ready, single-page PDF alongside the markdown post-mortem. The markdown report, the PDF and the AI Auditor interview context (`06_AI_AUDITOR_POSTMORTEM_INTERVIEW_SPEC.md`) are all built from the same unified incident dossier (`_build_incident_dossier()`), so the three representations share identical, point-in-time factual data.

---

## 2. Technical Dependencies & Architecture

- **Dependency:** `reportlab>=4.1.0` in `backend/requirements.txt`. Pure-Python PDF generation with no external binaries or headless browser; the page is drawn directly on a `reportlab.pdfgen.canvas.Canvas` (US Letter).
- **Unified Fact Model (`_build_incident_dossier`):** a function in `backend/app/api/v1/audits.py` that gathers the incident's own frozen facts (`tech_debt_at_creation`, `tech_debt_at_resolution`, `accrued_surcharge`, `mtta_seconds`, `mttr_seconds`) and the audit events provably tagged with its exact `incident_id` (runbooks, investigation start, root-cause confirmation, unattended-alert fines, applied auditor verdicts). It never uses the live session's current cash or tech debt to represent historical incident impact; session-wide events (SLA sanction, feature freeze, dilemmas) are exposed only as a labelled `concurrent_context`, never attributed to the incident.

---

## 3. REST Endpoint

`GET /api/audits/postmortem/{incident_id}/export-pdf`
- Returns HTTP 404 `"Incident not found in the compliance ledger"` for an unknown id; otherwise generates the PDF in memory and returns `Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="postmortem_{incident_id}.pdf"'})`.
- Has no state-mutating side effects (it is a `GET`; the PDF is not written to disk, unlike the markdown report which is persisted to `audits/reports/`).

---

## 4. Document Layout & Structure

The PDF is **one page** drawn top to bottom in the following blocks (as implemented in `_build_postmortem_pdf`):

1. **Header Band:** dark banner with "IncidentZero Corp." and "OFFICIAL COMPLIANCE DOSSIER — EXECUTIVE POST-MORTEM REPORT", followed by the incident id and severity.
2. **Executive Summary:** affected service, root cause (printed as "Not confirmed by this playthrough" unless the root cause was confirmed through triage), MTTA and MTTR in ticks, and the compliance status (`Flagged` when the incident's MTTA breached the unattended-alert window, otherwise `Clear`).
3. **Session SLA:** a progress bar for the session-wide rolling SLA *at export time*, explicitly labelled as session-wide and not decomposed per incident (the incident's own SLA contribution is reported as "not determined" rather than estimated).
4. **Timeline of Events:** the dossier's incident-scoped timeline (`T+<tick>` lines: created, acknowledged, investigation started, root cause confirmed, mitigations, regulatory breach fine, applied auditor verdict, resolved). The list stops when it reaches the lower part of the page, so a very long timeline is truncated in the PDF (the markdown report carries the full list).
5. **Financial Cost Accounting (attributed to this incident only):** accrued incident surcharge, mitigation cost, regulatory fines and AI auditor credits, and the attributed total. Session-wide passive burn and the cost of concurrent incidents are intentionally excluded.
6. **Content Checksum Seal:** a circular seal plus a 16-hex-character, upper-cased SHA-256 prefix computed over a canonical JSON of thirteen of the dossier's facts (incident id, service, severity, status, root-cause confirmation and text, MTTA, MTTR, tech debt at creation and at resolution, attributed total, mitigations, compliance status), together with the UTC export time.
   - **Governance Designation:** formally a **content checksum** for detecting accidental mismatch or corruption between what is printed and what is claimed. It is unsalted and unkeyed, so anyone holding the same facts can recompute it: it is **not** a cryptographic digital signature or PKI-based authenticity guarantee, and the page says so.

Sections of the markdown report that are **not** drawn on the PDF page: the point-in-time technical-debt section (the values feed the checksum, not the layout), the concurrent session context list, the separate compliance-status section beyond the one-line status, and the preventative action items.

---

## 5. UI Integration

- `PostMortemModal.tsx` footer offers three actions: copy the markdown, "Export Official PDF" (a plain anchor to `api.exportPostmortemPdfUrl(incidentId)` with `download="postmortem_<id>.pdf"`; the browser starts the native download with no client-side state mutation), and open the incident replay.
- The PDF button only builds a URL; it does not call the interview endpoints. An AI auditor verdict that has been applied shows up in the PDF's financial block and timeline (see `06_AI_AUDITOR_POSTMORTEM_INTERVIEW_SPEC.md`).
