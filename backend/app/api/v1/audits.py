import hashlib
import json
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas
from sqlalchemy.orm import Session as OrmSession

from app.core.config import settings
from app.core.database import SessionLocal
from app.engine import formulas
from app.models.audit import AuditLog
from app.models.incident import Incident
from app.models.session import GameSession
from app.schemas.interview import InterviewMessageRequest

router = APIRouter(tags=["audits"])

# repo layout: backend/app/api/v1/audits.py -> repo root is four levels up
REPO_ROOT = Path(__file__).resolve().parents[4]
TEMPLATE_PATH = REPO_ROOT / "audits" / "templates" / "post_mortem_template.md"
REPORTS_DIR = REPO_ROOT / "audits" / "reports"
INTERVIEWS_DIR = REPO_ROOT / "audits" / "interviews"

# --- incident forensics: the single source of truth for "what actually happened" -----------
#
# every audit event that can be tied to one exact incident carries an "incident_id" field in its
# details payload (see simulator.py's apply_mitigation/submit_triage/_progress_incidents). these
# are matched by an exact equality check in python, never a service-id substring or a "most
# recent event on this service" guess -- that guess is what let an old incident show a mitigation
# that actually resolved a *later* incident on the same service (see _incident_scoped_events).
INCIDENT_SCOPED_EVENT_TYPES = (
    "RUNBOOK_EXECUTED",
    "UNATTENDED_ALERT_VIOLATION",
    "ROOT_CAUSE_IDENTIFIED",
    "INVESTIGATION_STARTED",
    "AI_AUDITOR_VERDICT_APPLIED",
)

# session-wide governance events that are never specific to one incident -- surfaced only as
# explicitly-labeled concurrent context (see item 5: never attribute session-wide state to a
# single incident's own impact).
SESSION_CONTEXT_EVENT_TYPES = (
    "SLA_BREACH_EMERGENCY_SANCTION",
    "FEATURE_FREEZE_ENGAGED",
    "FEATURE_FREEZE_LIFTED",
    "DILEMMA_OFFERED",
    "DILEMMA_RESOLVED",
    "ELEVATED_RISK_WINDOW_OPENED",
)

SLA_NOT_DETERMINED_NOTE = (
    "SLA is tracked as a single session-wide rolling metric, not decomposed per incident. This "
    "incident's own contribution to SLA drawdown cannot be reliably isolated from concurrent "
    "incidents or background drift with the data currently recorded, so it is reported here as "
    "not determined rather than estimated or attributed in full."
)

AUDITOR_SYSTEM_PROMPT = """You are a Lead Auditor conducting a formal regulatory defense interview under
SOX-404 and SOC 2 Type II frameworks. You are reviewing a specific, already-resolved incident from the
IncidentZero platform's compliance ledger. You have been given the complete, factual incident dossier below,
treat every field in it as ground truth and do not speculate beyond it. The dossier's root_cause field is
null whenever the operator never confirmed the underlying cause during the incident itself -- do not invent
one; challenge the operator directly about that gap instead. Any "concurrent_context" entries in the dossier
are session-wide events that happened during the same window but were NOT caused by, and did not cause, this
incident -- never present them as evidence of this incident's own impact. Your task is to interrogate the
operator about their decisions during this incident, with particular scrutiny on any RUNBOOK_EXECUTED event
using the "Hotfix Prod Live" action, any UNATTENDED_ALERT_VIOLATION event, and whether MTTA/MTTR figures
indicate a pattern inconsistent with the incident's stated severity. Ask one focused question per turn.
Respond with a JSON object matching exactly this schema:
{"reply": string, "verdict": "PENDING" | "VALID" | "JUSTIFIED" | "NON_COMPLIANT",
"regulatory_fine_adjustment": number}. Use PENDING while the interview is still in progress.
regulatory_fine_adjustment is only your recommendation: the platform independently computes the actual
eligible amount against a severity-scaled ceiling before anything is ever applied, so reason about the
compliance finding itself rather than trying to land on a final number. Never invent facts not present in
the dossier; challenge the operator directly if their claim contradicts it."""

# minimal in-process sliding-window limiter guarding the LLM-backed interview endpoint. Not a
# substitute for real auth/quota infrastructure (single-process, resets on restart, keyed by
# client IP which is spoofable/shared behind NAT) -- but it closes the trivial "loop the
# endpoint as fast as possible" spend-amplification path against settings.LLM_API_KEY, given
# this endpoint (like the rest of the API) has no auth layer in front of it.
_INTERVIEW_RATE_LIMIT_WINDOW_SECONDS = 60.0
_INTERVIEW_RATE_LIMIT_MAX_CALLS = 10
_interview_call_log: Dict[str, List[float]] = defaultdict(list)
_interview_rate_limit_lock = Lock()


def _check_interview_rate_limit(client_key: str) -> None:
    """RAISE 429 IF THE CALLER HAS EXCEEDED THE INTERVIEW ENDPOINT'S PER-CLIENT CALL BUDGET"""
    now = time.monotonic()
    cutoff = now - _INTERVIEW_RATE_LIMIT_WINDOW_SECONDS
    with _interview_rate_limit_lock:
        calls = _interview_call_log[client_key]
        while calls and calls[0] < cutoff:
            calls.pop(0)
        if len(calls) >= _INTERVIEW_RATE_LIMIT_MAX_CALLS:
            raise HTTPException(
                status_code=429,
                detail="Too many interview turns in a short window; please slow down and try again shortly",
            )
        calls.append(now)


@router.get("/api/audits")
async def list_audits(request: Request) -> List[Dict[str, Any]]:
    """LIST RECENT COMPLIANCE LEDGER ENTRIES FROM THE LIVE ENGINE"""
    return request.app.state.engine.audit_logs


def _safe_json(raw: Optional[str]) -> Dict[str, Any]:
    """PARSE AN AuditLog.details_json BLOB, TOLERATING A MISSING/MALFORMED ROW RATHER THAN
    CRASHING REPORT GENERATION OVER ONE BAD LEGACY ENTRY"""
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def _incident_scoped_events(db: OrmSession, incident: Incident) -> List[AuditLog]:
    """EVENTS PROVABLY TIED TO THIS EXACT INCIDENT: CANDIDATES OF A KNOWN INCIDENT-SCOPED EVENT
    TYPE IN THE SAME SESSION, FILTERED BY AN EXACT incident_id MATCH -- NEVER A SERVICE-ID
    SUBSTRING OR "MOST RECENT EVENT ON THIS SERVICE" GUESS"""
    candidates = (
        db.query(AuditLog)
        .filter(AuditLog.session_id == incident.session_id)
        .filter(AuditLog.event_type.in_(INCIDENT_SCOPED_EVENT_TYPES))
        .order_by(AuditLog.tick.asc())
        .all()
    )
    return [row for row in candidates if _safe_json(row.details_json).get("incident_id") == incident.id]


def _concurrent_session_events(db: OrmSession, incident: Incident) -> List[AuditLog]:
    """SESSION-WIDE GOVERNANCE EVENTS THAT FELL INSIDE THIS INCIDENT'S OPEN WINDOW, SURFACED ONLY
    AS LABELED CONTEXT -- NEVER FOLDED INTO THIS INCIDENT'S OWN TIMELINE OR FINANCIAL IMPACT"""
    window_end = incident.resolved_tick if incident.resolved_tick is not None else incident.created_tick + 50
    return (
        db.query(AuditLog)
        .filter(AuditLog.session_id == incident.session_id)
        .filter(AuditLog.event_type.in_(SESSION_CONTEXT_EVENT_TYPES))
        .filter(AuditLog.tick >= incident.created_tick, AuditLog.tick <= window_end)
        .order_by(AuditLog.tick.asc())
        .all()
    )


def _build_incident_dossier(db: OrmSession, incident: Incident) -> Dict[str, Any]:
    """ASSEMBLE THE SINGLE FACTUAL RECORD FOR THIS EXACT INCIDENT -- THE ONE PLACE THE POSTMORTEM
    MARKDOWN, THE PDF EXPORT AND THE AI AUDITOR'S DOSSIER ALL SOURCE FROM, REPLACING THREE
    PREVIOUSLY-DIVERGENT SERVICE-ID/RECENCY-BASED LOOKUPS.

    Deliberately never reads session.budget/session.tech_debt/session.sla_percentage to
    reconstruct this incident's past -- only the incident's own frozen fields
    (tech_debt_at_creation/tech_debt_at_resolution/accrued_surcharge/mtta_seconds/mttr_seconds)
    and events provably tagged with its exact incident_id. Because none of those inputs change
    once the incident is resolved, generating this dossier twice at different points in the same
    playthrough produces the same result (see item 13: immutable history)."""
    scoped_events = _incident_scoped_events(db, incident)
    concurrent_events = _concurrent_session_events(db, incident)

    runbook_events = [e for e in scoped_events if e.event_type == "RUNBOOK_EXECUTED"]
    investigation_events = [e for e in scoped_events if e.event_type == "INVESTIGATION_STARTED"]
    root_cause_events = [e for e in scoped_events if e.event_type == "ROOT_CAUSE_IDENTIFIED"]
    breach_events = [e for e in scoped_events if e.event_type == "UNATTENDED_ALERT_VIOLATION"]
    verdict_events = [e for e in scoped_events if e.event_type == "AI_AUDITOR_VERDICT_APPLIED"]

    mitigations: List[Dict[str, Any]] = []
    mitigation_cost_total = 0.0
    for e in runbook_events:
        details = _safe_json(e.details_json)
        cost = float(details.get("cost", 0.0))
        mitigation_cost_total += cost
        mitigations.append(
            {
                "tick": e.tick,
                "action": details.get("action", "Manual remediation"),
                "cost": cost,
                "effectiveness": details.get("effectiveness"),
                "fully_resolved": bool(details.get("fully_resolved")),
            }
        )

    breach_fine_total = sum(float(_safe_json(e.details_json).get("fine_amount", 0.0)) for e in breach_events)

    verdict_fine_total = 0.0
    verdict_credit_total = 0.0
    for e in verdict_events:
        amount = float(_safe_json(e.details_json).get("amount", 0.0))
        if amount < 0:
            verdict_fine_total += -amount
        else:
            verdict_credit_total += amount

    accrued_surcharge = float(incident.accrued_surcharge or 0.0)
    regulatory_fines = breach_fine_total + verdict_fine_total
    financial_impact = {
        "accrued_surcharge": round(accrued_surcharge, 2),
        "mitigation_cost": round(mitigation_cost_total, 2),
        "regulatory_fines": round(regulatory_fines, 2),
        "audit_credits": round(verdict_credit_total, 2),
        "total": round(accrued_surcharge + mitigation_cost_total + regulatory_fines - verdict_credit_total, 2),
        "unattributed_note": (
            "Session-wide passive operational burn (cloud/payroll) and the cost of any other "
            "concurrent incident are intentionally excluded here: they cannot be safely "
            "attributed to this specific incident."
        ),
    }

    tdi_before = incident.tech_debt_at_creation
    tdi_after = incident.tech_debt_at_resolution
    tdi_delta = (tdi_after - tdi_before) if (tdi_before is not None and tdi_after is not None) else None

    root_cause_confirmed = bool(incident.triage_solved)
    root_cause = incident.root_cause if root_cause_confirmed else None

    timeline: List[Dict[str, Any]] = [
        {"tick": incident.created_tick, "phase": "created", "description": "Incident created; automated monitor raised the alarm."}
    ]
    if incident.acknowledged_tick is not None:
        timeline.append(
            {"tick": incident.acknowledged_tick, "phase": "acknowledged", "description": "Alert acknowledged by on-call engineer."}
        )
    for e in investigation_events:
        timeline.append({"tick": e.tick, "phase": "investigation_started", "description": "Root-cause investigation started."})
    for e in root_cause_events:
        details = _safe_json(e.details_json)
        wrong_attempts = details.get("wrong_attempts", 0)
        timeline.append(
            {
                "tick": e.tick,
                "phase": "root_cause_confirmed",
                "description": f"Root cause confirmed after {wrong_attempts} incorrect attempt(s).",
            }
        )
    for m in mitigations:
        outcome = "fully resolved the service" if m["fully_resolved"] else "partially mitigated the service (cause mismatch)"
        timeline.append(
            {"tick": m["tick"], "phase": "mitigation_executed", "description": f"Mitigation executed: {m['action']} -- {outcome}."}
        )
    for e in breach_events:
        timeline.append(
            {"tick": e.tick, "phase": "regulatory_breach", "description": "Unattended-alert regulatory breach fine applied."}
        )
    for e in verdict_events:
        details = _safe_json(e.details_json)
        timeline.append(
            {
                "tick": e.tick,
                "phase": "ai_auditor_verdict_applied",
                "description": f"AI auditor verdict applied: {details.get('verdict', 'UNKNOWN')}.",
            }
        )
    if incident.resolved_tick is not None:
        timeline.append({"tick": incident.resolved_tick, "phase": "resolved", "description": "Incident marked resolved."})
    timeline.sort(key=lambda entry: entry["tick"])

    concurrent_context = [
        {"tick": e.tick, "event_type": e.event_type, "actor": e.actor, "details": _safe_json(e.details_json)}
        for e in concurrent_events
    ]

    return {
        "incident_id": incident.id,
        "session_id": incident.session_id,
        "service_id": incident.service_id,
        "severity": incident.severity,
        "title": incident.title,
        "status": incident.status,
        "created_tick": incident.created_tick,
        "acknowledged_tick": incident.acknowledged_tick,
        "resolved_tick": incident.resolved_tick,
        "mtta_ticks": incident.mtta_seconds,
        "mttr_ticks": incident.mttr_seconds,
        "root_cause_confirmed": root_cause_confirmed,
        "root_cause": root_cause,
        "tech_debt_at_creation": tdi_before,
        "tech_debt_at_resolution": tdi_after,
        "tech_debt_delta": tdi_delta,
        "financial_impact": financial_impact,
        "sla_note": SLA_NOT_DETERMINED_NOTE,
        "compliance_status": "Flagged" if formulas.is_unattended_breach(incident.mtta_seconds) else "Clear",
        "mitigations": mitigations,
        "timeline": timeline,
        "concurrent_context": concurrent_context,
    }


@router.get("/api/audits/postmortem/{incident_id}")
async def generate_postmortem(incident_id: str, request: Request) -> Dict[str, Any]:
    """RENDER AND PERSIST A POST-MORTEM REPORT FOR AN INCIDENT, BUILT ENTIRELY FROM ITS OWN
    FROZEN FACTS AND EXACT-incident_id-TAGGED EVENTS"""
    db: OrmSession = SessionLocal()
    try:
        incident = db.get(Incident, incident_id)
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found in the compliance ledger")

        dossier = _build_incident_dossier(db, incident)
        markdown = _render_template(dossier)
        report_path = _persist_report(incident_id, markdown)

        return {"incident_id": incident_id, "markdown": markdown, "saved_to": str(report_path)}
    finally:
        db.close()


def _render_template(dossier: Dict[str, Any]) -> str:
    """FILL THE POST-MORTEM MARKDOWN TEMPLATE FROM THE INCIDENT DOSSIER ONLY -- NO LIVE SESSION
    STATE, SO KNOWN/UNKNOWN/CALCULATED/HUMAN-DECISION SECTIONS NEVER FABRICATE WHAT ISN'T THERE"""
    template = TEMPLATE_PATH.read_text(encoding="utf-8")

    timeline_lines = "\n".join(f"- **T+{e['tick']}:** {e['description']}" for e in dossier["timeline"])
    if not timeline_lines:
        timeline_lines = "- No timeline events recorded for this incident."

    if dossier["root_cause_confirmed"]:
        root_cause_block = dossier["root_cause"]
    else:
        root_cause_block = (
            "Not confirmed. Either the service was restored before an investigation concluded, "
            "or no investigation was ever started for this incident. No root cause is asserted."
        )

    fin = dossier["financial_impact"]
    financial_block = (
        f"- Incident Surcharge (accrued while open): ${fin['accrued_surcharge']:,.2f}\n"
        f"- Mitigation Cost: ${fin['mitigation_cost']:,.2f}\n"
        f"- Regulatory Fines: ${fin['regulatory_fines']:,.2f}\n"
        f"- AI Auditor Credits: -${fin['audit_credits']:,.2f}\n"
        f"- **Total Attributed to This Incident: ${fin['total']:,.2f}**\n\n"
        f"_{fin['unattributed_note']}_"
    )

    if dossier["tech_debt_delta"] is not None:
        tech_debt_block = (
            f"- Before: {dossier['tech_debt_at_creation']}\n"
            f"- After: {dossier['tech_debt_at_resolution']}\n"
            f"- Delta: {dossier['tech_debt_delta']:+d}"
        )
    elif dossier["tech_debt_at_creation"] is not None:
        tech_debt_block = f"- Before: {dossier['tech_debt_at_creation']}\n- After: not yet resolved."
    else:
        tech_debt_block = "- Not recorded for this incident (predates forensic tech-debt tracking)."

    if dossier["concurrent_context"]:
        concurrent_block = "\n".join(
            f"- T+{e['tick']}: {e['event_type']} (session-wide; not caused by this incident)"
            for e in dossier["concurrent_context"]
        )
    else:
        concurrent_block = "- None recorded during this incident's window."

    mitigation_summary = "; ".join(f"{m['action']} (T+{m['tick']})" for m in dossier["mitigations"]) or "no mitigation executed yet"
    executive_summary = (
        f"{dossier['severity']} incident on {dossier['service_id']}, status: {dossier['status']}. "
        f"MTTA {dossier['mtta_ticks']} ticks, MTTR {dossier['mttr_ticks']} ticks. "
        f"Mitigation(s): {mitigation_summary}."
    )

    replacements = {
        "{{INCIDENT_ID}}": dossier["incident_id"],
        "{{REPORT_STATUS}}": "Published" if dossier["status"] == "resolved" else "Draft (incident still open)",
        "{{ACTOR}}": "VP_OF_INFRA",
        "{{GENERATED_TICK}}": str(dossier["resolved_tick"] if dossier["resolved_tick"] is not None else dossier["created_tick"]),
        "{{SEVERITY}}": dossier["severity"],
        "{{IMPACTED_SERVICES}}": dossier["service_id"],
        "{{INCIDENT_STATUS}}": dossier["status"],
        "{{EXECUTIVE_SUMMARY}}": executive_summary,
        "{{TIMELINE_BLOCK}}": timeline_lines,
        "{{ROOT_CAUSE_BLOCK}}": root_cause_block,
        "{{FINANCIAL_BLOCK}}": financial_block,
        "{{SLA_NOTE}}": dossier["sla_note"],
        "{{TECH_DEBT_BLOCK}}": tech_debt_block,
        "{{CONCURRENT_CONTEXT_BLOCK}}": concurrent_block,
        "{{COMPLIANCE_STATUS}}": dossier["compliance_status"],
    }
    for placeholder, value in replacements.items():
        template = template.replace(placeholder, value)
    return template


def _persist_report(incident_id: str, markdown: str) -> Path:
    """SAVE THE RENDERED POST-MORTEM TO THE AUDITS REPORTS DIRECTORY"""
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORTS_DIR / f"{incident_id}.md"
    report_path.write_text(markdown, encoding="utf-8")
    return report_path


@router.get("/api/audits/postmortem/{incident_id}/export-pdf")
async def export_postmortem_pdf(incident_id: str) -> Response:
    """GENERATE A BRANDED EXECUTIVE PDF POST-MORTEM DOSSIER FOR AN INCIDENT"""
    db: OrmSession = SessionLocal()
    try:
        incident = db.get(Incident, incident_id)
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found in the compliance ledger")

        dossier = _build_incident_dossier(db, incident)

        # the only intentionally session-wide, current-state figure on the whole page: the
        # session's SLA% at the moment of export, clearly labeled as such rather than presented
        # as this incident's own SLA impact (see dossier["sla_note"] for the incident-scoped view)
        session = db.get(GameSession, incident.session_id)
        session_sla_percentage = float(session.sla_percentage) if session else None

        pdf_bytes = _build_postmortem_pdf(dossier, session_sla_percentage)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="postmortem_{incident_id}.pdf"'},
        )
    finally:
        db.close()


def _build_postmortem_pdf(dossier: Dict[str, Any], session_sla_percentage: Optional[float]) -> bytes:
    """DRAW THE BRANDED EXECUTIVE POST-MORTEM DOCUMENT WITH REPORTLAB, SOURCED ENTIRELY FROM THE
    INCIDENT DOSSIER (SEE _build_incident_dossier)"""
    buffer = BytesIO()
    doc = canvas.Canvas(buffer, pagesize=LETTER)
    width, height = LETTER
    margin = 54
    y = height - margin

    # header band with company branding
    doc.setFillColor(colors.HexColor("#0f172a"))
    doc.rect(0, height - 80, width, 80, fill=1, stroke=0)
    doc.setFillColor(colors.white)
    doc.setFont("Helvetica-Bold", 18)
    doc.drawString(margin, height - 45, "IncidentZero Corp.")
    doc.setFont("Helvetica", 10)
    doc.drawString(margin, height - 62, "OFFICIAL COMPLIANCE DOSSIER — EXECUTIVE POST-MORTEM REPORT")
    y = height - 105

    doc.setFillColor(colors.black)
    doc.setFont("Helvetica-Bold", 13)
    doc.drawString(margin, y, f"Incident {dossier['incident_id']}  ·  {dossier['severity']}")
    y -= 24

    # executive summary block
    doc.setFont("Helvetica-Bold", 11)
    doc.drawString(margin, y, "Executive Summary")
    y -= 16
    doc.setFont("Helvetica", 10)
    root_cause_line = dossier["root_cause"] if dossier["root_cause_confirmed"] else "Not confirmed by this playthrough"
    summary_lines = [
        f"Affected Service: {dossier['service_id']}",
        f"Root Cause: {root_cause_line}",
        f"MTTA: {dossier['mtta_ticks']} ticks   MTTR: {dossier['mttr_ticks']} ticks",
        f"Compliance Status: {dossier['compliance_status']}",
    ]
    for line in summary_lines:
        doc.drawString(margin, y, line)
        y -= 14
    y -= 8

    # session-wide SLA reading at export time -- explicitly labeled as session-wide, never as
    # this incident's own SLA impact (see item 5)
    doc.setFont("Helvetica-Bold", 11)
    doc.drawString(margin, y, "Session SLA (session-wide, at export time)")
    y -= 16
    sla_pct = session_sla_percentage if session_sla_percentage is not None else 0.0
    bar_width = width - 2 * margin
    doc.setStrokeColor(colors.HexColor("#94a3b8"))
    doc.rect(margin, y - 12, bar_width, 12, fill=0, stroke=1)
    doc.setFillColor(colors.HexColor("#0ea5e9"))
    doc.rect(margin, y - 12, bar_width * min(1.0, sla_pct / 100.0), 12, fill=1, stroke=0)
    doc.setFillColor(colors.black)
    doc.setFont("Helvetica", 9)
    doc.drawString(margin + bar_width + 4 - 40, y - 12, f"{sla_pct:.2f}%")
    y -= 18
    doc.setFont("Helvetica-Oblique", 7)
    doc.drawString(margin, y, "Not decomposed per incident -- see Section 5 of the markdown report.")
    y -= 22

    # timeline of events, incident-scoped only
    doc.setFont("Helvetica-Bold", 11)
    doc.drawString(margin, y, "Timeline of Events")
    y -= 16
    doc.setFont("Helvetica", 9)
    for event in dossier["timeline"]:
        doc.drawString(margin, y, f"T+{event['tick']}   {event['description']}")
        y -= 12
        if y < 160:
            break
    y -= 10

    # financial cost accounting, attributed to this incident only
    doc.setFont("Helvetica-Bold", 11)
    doc.drawString(margin, y, "Financial Cost Accounting (Attributed to This Incident)")
    y -= 16
    doc.setFont("Helvetica", 10)
    fin = dossier["financial_impact"]
    doc.drawString(margin, y, f"Incident Surcharge (accrued while open): ${fin['accrued_surcharge']:,.2f}")
    y -= 14
    doc.drawString(margin, y, f"Mitigation Cost: ${fin['mitigation_cost']:,.2f}")
    y -= 14
    doc.drawString(margin, y, f"Regulatory Fines: ${fin['regulatory_fines']:,.2f}  ·  AI Auditor Credits: -${fin['audit_credits']:,.2f}")
    y -= 14
    doc.setFont("Helvetica-Bold", 10)
    doc.drawString(margin, y, f"Total Attributed: ${fin['total']:,.2f}")
    y -= 30

    # content-integrity checksum: a plain, unsalted, unkeyed SHA-256 of the report's own certified
    # facts, bound to their content (not merely a hash of the incident id, which would "verify"
    # nothing about what was actually printed above). deliberately labeled as a checksum, not a
    # certification/signature: anyone holding the same eleven already-visible facts can recompute
    # this exact digest with no secret required, so it can only catch accidental content
    # mismatch/corruption between what's printed and what's claimed -- it does not authenticate the
    # issuer or resist a deliberate adversary who edits the facts and recomputes the same hash.
    canonical_facts = {
        "incident_id": dossier["incident_id"],
        "service_id": dossier["service_id"],
        "severity": dossier["severity"],
        "status": dossier["status"],
        "root_cause_confirmed": dossier["root_cause_confirmed"],
        "root_cause": dossier["root_cause"],
        "mtta_ticks": dossier["mtta_ticks"],
        "mttr_ticks": dossier["mttr_ticks"],
        "tech_debt_at_creation": dossier["tech_debt_at_creation"],
        "tech_debt_at_resolution": dossier["tech_debt_at_resolution"],
        "financial_impact_total": fin["total"],
        "mitigations": dossier["mitigations"],
        "compliance_status": dossier["compliance_status"],
    }
    content_checksum = hashlib.sha256(
        json.dumps(canonical_facts, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()[:16].upper()
    seal_cx, seal_cy, seal_r = margin + 40, 90, 34
    doc.setStrokeColor(colors.HexColor("#0f172a"))
    doc.setLineWidth(1.5)
    doc.circle(seal_cx, seal_cy, seal_r, fill=0, stroke=1)
    doc.setFont("Helvetica-Bold", 8)
    doc.drawCentredString(seal_cx, seal_cy + 6, "CHECKSUM")
    doc.setFont("Helvetica", 6)
    doc.drawCentredString(seal_cx, seal_cy - 4, "CONTENT")
    doc.drawCentredString(seal_cx, seal_cy - 12, "INTEGRITY")
    doc.setFont("Helvetica", 8)
    export_time = datetime.now(timezone.utc).isoformat()
    doc.drawString(margin + 90, 100, f"Content Checksum: {content_checksum}")
    doc.drawString(margin + 90, 88, f"Exported: {export_time}")
    doc.setFont("Helvetica-Oblique", 7)
    doc.drawString(margin + 90, 76, "Checksum of this report's own certified facts above -- not a certification or cryptographic signature.")

    doc.showPage()
    doc.save()
    return buffer.getvalue()


@router.post("/api/audits/postmortem/{incident_id}/interview")
async def conduct_interview(incident_id: str, payload: InterviewMessageRequest, request: Request) -> Dict[str, Any]:
    """CONDUCT ONE TURN OF AN LLM-DRIVEN REGULATORY DEFENSE INTERVIEW FOR A RESOLVED INCIDENT"""
    if not settings.LLM_API_KEY:
        raise HTTPException(status_code=503, detail="AI Auditor interview service is not configured")

    client_key = request.client.host if request.client else "unknown"
    _check_interview_rate_limit(client_key)

    db: OrmSession = SessionLocal()
    try:
        incident = db.get(Incident, incident_id)
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found in the compliance ledger")

        session = db.get(GameSession, incident.session_id)
        context = _compile_interview_context(db, incident, session)
        transcript = _load_or_init_transcript(incident_id)
        transcript.append({"role": "player", "content": payload.message})

        auditor_response = await _invoke_auditor_llm(context, transcript)
        transcript.append({"role": "auditor", "content": auditor_response["reply"]})

        # the LLM's raw proposal is never trusted as-is: the eligible amount actually available
        # for application is capped/sign-validated by the backend right here, and it is this
        # capped figure -- not the raw proposal -- shown back to the player as the preview
        eligible_amount = formulas.eligible_audit_adjustment(
            auditor_response["verdict"], auditor_response["regulatory_fine_adjustment"], incident.severity
        )

        _persist_transcript(incident_id, transcript)
        _persist_interview_event(db, incident_id, auditor_response, eligible_amount)

        return {
            "incident_id": incident_id,
            "reply": auditor_response["reply"],
            "verdict": auditor_response["verdict"],
            "regulatory_fine_adjustment": eligible_amount,
            "transcript_turn": len(transcript) // 2,
        }
    finally:
        db.close()


def _verdict_already_applied(incident_id: str) -> bool:
    """CROSS-CHECK THE PERSISTED AuditLog FOR AN AI_AUDITOR_VERDICT_APPLIED EVENT ALREADY RECORDED
    FOR THIS EXACT incident_id -- SAME EXACT-MATCH APPROACH AS _incident_scoped_events, USED HERE
    AS A SECOND, DB-BACKED IDEMPOTENCY SIGNAL INDEPENDENT OF THE VERDICT CACHE FILE'S "applied"
    FLAG (SEE apply_interview_verdict FOR WHY THE FLAG ALONE ISN'T ENOUGH)"""
    db: OrmSession = SessionLocal()
    try:
        candidates = db.query(AuditLog).filter(AuditLog.event_type == "AI_AUDITOR_VERDICT_APPLIED").all()
        return any(_safe_json(row.details_json).get("incident_id") == incident_id for row in candidates)
    finally:
        db.close()


@router.post("/api/audits/postmortem/{incident_id}/interview/apply-verdict")
async def apply_interview_verdict(incident_id: str, request: Request) -> Dict[str, Any]:
    """APPLY THE MOST RECENT INTERVIEW VERDICT'S ELIGIBLE REGULATORY ADJUSTMENT TO THE LIVE
    SESSION BUDGET -- session_id + incident_id LINKAGE, A BACKEND-COMPUTED VALUE CEILING, AND
    SINGLE-APPLICATION IDEMPOTENCY ARE ALL ENFORCED HERE, NEVER LEFT TO THE CACHED CLIENT/LLM DATA"""
    db: OrmSession = SessionLocal()
    try:
        incident = db.get(Incident, incident_id)
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found in the compliance ledger")
        incident_session_id = incident.session_id
        severity = incident.severity
    finally:
        db.close()

    engine = request.app.state.engine
    if incident_session_id != engine.session_id:
        # guarantees the session_id + incident_id linkage: an incident from a past/other session
        # must never be applied against whichever session happens to be live right now
        raise HTTPException(
            status_code=400,
            detail="This incident belongs to a different session and cannot be applied to the current session",
        )

    verdict_meta = _load_latest_verdict(incident_id)
    if not verdict_meta or verdict_meta["verdict"] == "PENDING":
        raise HTTPException(status_code=400, detail="No concluded interview verdict available to apply")
    if verdict_meta.get("applied"):
        # idempotency guard: this exact cached verdict was already charged/credited once (a
        # double-click, a client retry, or a restart replaying the same request must never debit
        # the fine a second time). a genuinely new verdict from a later interview turn is not
        # blocked by this -- _persist_interview_event always caches a fresh one as unapplied.
        raise HTTPException(status_code=400, detail="This interview verdict has already been applied")
    if _verdict_already_applied(incident_id):
        # second, DB-backed idempotency signal, independent of the cache file's flag: the flag
        # below is only ever written *after* _apply_financial_event already committed the debit
        # and this exact audit event -- a crash in that narrow window would leave the flag unset
        # even though the adjustment already happened. the persisted audit trail is checked here
        # too, and self-heals the cache file so a further retry short-circuits on the cheap flag.
        verdict_meta["applied"] = True
        INTERVIEWS_DIR.mkdir(parents=True, exist_ok=True)
        (INTERVIEWS_DIR / f"{incident_id}.verdict.json").write_text(json.dumps(verdict_meta), encoding="utf-8")
        raise HTTPException(status_code=400, detail="This interview verdict has already been applied")

    # the backend is the sole financial authority: the LLM's proposed_amount is only ever a
    # recommendation, re-clamped here against a severity-scaled ceiling -- never trusted verbatim
    # from the cache file, however it got there. the regulatory_fine_adjustment fallback covers a
    # verdict cache file written by a pre-existing older build of this endpoint.
    proposed_amount = verdict_meta.get("proposed_amount", verdict_meta.get("regulatory_fine_adjustment", 0.0))
    eligible_amount = formulas.eligible_audit_adjustment(verdict_meta["verdict"], proposed_amount, severity)

    # routed through the engine's centralized financial-event method (same one every in-engine
    # cash movement uses) rather than poking engine.budget directly from the api layer, so this
    # adjustment is deducted, logged and ledgered from the exact same call
    engine._apply_financial_event(
        category="regulatory_fine",
        amount=-eligible_amount,
        reference=incident_id,
        audit_event_type="AI_AUDITOR_VERDICT_APPLIED",
        audit_details={
            "incident_id": incident_id,
            "verdict": verdict_meta["verdict"],
            "proposed_amount": round(proposed_amount, 2),
            "eligible_amount": round(eligible_amount, 2),
        },
        actor="AUDIT_SYSTEM",
        compliance_flag=verdict_meta["verdict"] != "NON_COMPLIANT",
    )

    # mark this exact cached verdict as applied only after the financial event above has actually
    # gone through, so a failure applying it never falsely blocks a legitimate retry
    verdict_meta["applied"] = True
    verdict_path = INTERVIEWS_DIR / f"{incident_id}.verdict.json"
    verdict_path.write_text(json.dumps(verdict_meta), encoding="utf-8")

    return {"success": True, "budget": engine.budget}


def _compile_interview_context(db: OrmSession, incident: Incident, session: Optional[GameSession]) -> Dict[str, Any]:
    """ASSEMBLE THE FULL INCIDENT DOSSIER THE AI AUDITOR PERSONA IS GROUNDED IN -- REUSES THE SAME
    _build_incident_dossier AS THE HUMAN-FACING REPORTS, SO THE AUDITOR NEVER SEES A DIFFERENT
    (AND POSSIBLY MORE FLATTERING OR MORE DAMNING) VERSION OF EVENTS THAN THE PLAYER DOES"""
    dossier = _build_incident_dossier(db, incident)
    session_context = None
    if session:
        session_context = {
            "tech_debt_current": session.tech_debt,
            "sla_percentage_current": float(session.sla_percentage),
            "note": "Session-wide, as of right now -- NOT specific to this incident and must not be presented as this incident's own impact.",
        }
    return {**dossier, "session_context": session_context}


# the LLM's output is untrusted input, exactly like any other external response: its structure,
# enum membership and size are all validated before anything downstream treats it as ground truth
_ALLOWED_AUDITOR_VERDICTS = ("PENDING", "VALID", "JUSTIFIED", "NON_COMPLIANT")
_MAX_AUDITOR_REPLY_CHARS = 4000


async def _invoke_auditor_llm(context: Dict[str, Any], transcript: List[Dict[str, str]]) -> Dict[str, Any]:
    """INVOKE THE LLM AUDITOR PERSONA WITH THE COMPILED DOSSIER AND CONVERSATION HISTORY"""
    messages = [
        {"role": "system", "content": AUDITOR_SYSTEM_PROMPT},
        {"role": "system", "content": f"INCIDENT DOSSIER (ground truth, JSON):\n{json.dumps(context, indent=2)}"},
    ] + [{"role": m["role"], "content": m["content"]} for m in transcript]

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                settings.LLM_API_BASE_URL,
                headers={"Authorization": f"Bearer {settings.LLM_API_KEY}", "Content-Type": "application/json"},
                json={"model": settings.LLM_MODEL_ID, "messages": messages, "response_format": {"type": "json_object"}},
            )
            resp.raise_for_status()
            raw = resp.json()["choices"][0]["message"]["content"]
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            raise TypeError("Auditor response was not a JSON object")
        verdict = parsed.get("verdict", "PENDING")
        if verdict not in _ALLOWED_AUDITOR_VERDICTS:
            # an unrecognized verdict string is never trusted (it would otherwise be treated as
            # "not NON_COMPLIANT", i.e. compliant, by every downstream compliance_flag check) --
            # fail into the same neutral holding pattern as a parse error
            verdict = "PENDING"
        return {
            "reply": str(parsed["reply"])[:_MAX_AUDITOR_REPLY_CHARS],
            "verdict": verdict,
            "regulatory_fine_adjustment": float(parsed.get("regulatory_fine_adjustment", 0.0)),
        }
    except (httpx.HTTPError, json.JSONDecodeError, KeyError, IndexError, TypeError, ValueError):
        # malformed or unreachable model response -- including an empty "choices" array, a
        # non-object top-level JSON value, or a non-numeric regulatory_fine_adjustment -- fails
        # into a neutral holding pattern rather than crashing the interview or fabricating a
        # verdict the model did not actually produce
        return {
            "reply": "The auditor's response could not be parsed. Please restate your previous answer.",
            "verdict": "PENDING",
            "regulatory_fine_adjustment": 0.0,
        }


def _load_or_init_transcript(incident_id: str) -> List[Dict[str, str]]:
    """LOAD AN EXISTING INTERVIEW TRANSCRIPT OR START A NEW ONE"""
    path = INTERVIEWS_DIR / f"{incident_id}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return []


def _persist_transcript(incident_id: str, transcript: List[Dict[str, str]]) -> None:
    """DURABLY SAVE THE FULL INTERVIEW TRANSCRIPT, APPENDING ACROSS CALLS"""
    INTERVIEWS_DIR.mkdir(parents=True, exist_ok=True)
    path = INTERVIEWS_DIR / f"{incident_id}.json"
    path.write_text(json.dumps(transcript, indent=2), encoding="utf-8")


def _load_latest_verdict(incident_id: str) -> Optional[Dict[str, Any]]:
    """READ THE MOST RECENT VERDICT RECORDED FOR AN INCIDENT'S INTERVIEW, IF ANY"""
    path = INTERVIEWS_DIR / f"{incident_id}.verdict.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _persist_interview_event(db: OrmSession, incident_id: str, auditor_response: Dict[str, Any], eligible_amount: float) -> None:
    """RECORD AN AI AUDITOR INTERVIEW TURN AS A GOVERNANCE LEDGER ENTRY AND CACHE ITS VERDICT.

    Both the LLM's raw proposed_amount and the backend-computed eligible_amount are recorded --
    apply_interview_verdict still re-derives eligible_amount from proposed_amount at application
    time rather than trusting this cached figure verbatim, but keeping both here makes the LLM's
    original recommendation visible in the compliance ledger for traceability."""
    incident = db.get(Incident, incident_id)
    proposed_amount = auditor_response["regulatory_fine_adjustment"]
    db.add(
        AuditLog(
            id=f"aud-{uuid.uuid4().hex[:8]}",
            session_id=incident.session_id,
            tick=0,
            event_type="AI_AUDITOR_INTERVIEW_TURN",
            actor="AUDIT_SYSTEM",
            details_json=json.dumps(
                {
                    "incident_id": incident_id,
                    "verdict": auditor_response["verdict"],
                    "proposed_amount": round(proposed_amount, 2),
                    "eligible_amount": round(eligible_amount, 2),
                }
            ),
            compliance_flag=auditor_response["verdict"] != "NON_COMPLIANT",
        )
    )
    db.commit()

    # cache the latest verdict separately so apply-verdict does not need to replay the audit log.
    # a fresh verdict from a new interview turn always starts unapplied -- if the player continues
    # chatting after already applying an earlier verdict, this later one is a genuinely new result
    # and is eligible for its own single application (see apply_interview_verdict's idempotency
    # guard, which rejects only a *repeat* apply-verdict call against the *same* cached verdict)
    INTERVIEWS_DIR.mkdir(parents=True, exist_ok=True)
    verdict_path = INTERVIEWS_DIR / f"{incident_id}.verdict.json"
    verdict_path.write_text(
        json.dumps(
            {
                "verdict": auditor_response["verdict"],
                "proposed_amount": proposed_amount,
                "applied": False,
            }
        ),
        encoding="utf-8",
    )
