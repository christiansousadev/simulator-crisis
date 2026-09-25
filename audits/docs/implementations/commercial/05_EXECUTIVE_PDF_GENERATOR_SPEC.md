# Executive PDF Report Generator — Implementation Specification

**Document ID:** IZ-COMM-05
**Classification:** Implementation Contract — Commercial Pillar 5
**Status:** Implemented, additive only, non-breaking
**Integration baseline:** `backend/app/api/v1/audits.py`, `audits/docs/05_POST_MORTEM_STANDARD_OPERATING_PROCEDURE.md`

---

## 1. System Objective

Give the existing markdown post-mortem pipeline (Document 05) a second, formal export format suitable for external distribution to a board or a real auditor: a branded PDF with the same underlying facts, laid out as an executive document rather than a developer-facing markdown file.

## 2. Dependency

`reportlab` is added to `backend/requirements.txt` — a pure-Python PDF drawing library with no system-level binary dependency (unlike `weasyprint`/`wkhtmltopdf`, which require an external rendering engine), keeping the deployment footprint minimal.

## 3. Endpoint

`GET /api/audits/postmortem/{incident_id}/export-pdf`, additive to `audits.py`, sitting beside (not replacing) `generate_postmortem`. It reuses the exact same `Incident`/`GameSession`/mitigation-lookup query already factored for the markdown path and the AI-auditor interview (Document `06_AI_AUDITOR_POSTMORTEM_INTERVIEW_SPEC.md` § 2.2), so all three export paths (`markdown`, `interview`, `pdf`) draw from one consistent data-gathering source rather than three independently-maintained queries.

## 4. Document Layout

Built with `reportlab.pdfgen.canvas` directly (no heavier `platypus` flowable dependency needed for a single-page-oriented document):

1. **Header band** — "IncidentZero Corp." wordmark, a horizontal rule, "OFFICIAL COMPLIANCE DOSSIER" subtitle, incident id and severity.
2. **Executive summary block** — root cause, affected service, MTTA/MTTR (ticks), compliance status.
3. **SLA impact bar** — a single proportional rectangle (filled width = `session.sla_percentage`, drawn against a 100%-width outline), labeled with the exact percentage — a real, data-driven chart element, not decorative.
4. **Timeline of events** — a bulleted list drawn from the same audit-log correlation query used by the interview endpoint, one line per event with its tick and event type.
5. **Financial cost accounting** — a simple two-column table: passive burn attribution, incident surcharge attribution (recomputed from `formulas.incident_surcharge` at the incident's final MTTR), and the mitigation cost pulled from the matched `RUNBOOK_EXECUTED` audit entry.
6. **Digital auditor signature seal** — a drawn circle containing "CERTIFIED" and a deterministic pseudo-hash string (`sha256` of the incident id, truncated) presented as a verification code, plus the current server wall-clock export timestamp — explicitly labeled as a **document integrity stamp**, not a cryptographic signature, since no real PKI is involved (an honest-disclosure choice consistent with this project's established documentation voice).

## 5. Response Contract

The endpoint returns `Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="postmortem_{incident_id}.pdf"'})`. Like `generate_postmortem`, it performs no incident-status gate (Document 05 § 2.6's disclosed limitation applies equally here).

## 6. Frontend

`PostMortemModal.tsx` gains an "Export Official PDF" button beside its existing markdown view, pointing directly at the export endpoint's URL via a plain anchor (`<a href=... download>`) rather than a fetch/blob round-trip — the browser's native download handling is sufficient since the endpoint requires no request body and no auth header.
