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

AUDITOR_SYSTEM_PROMPT = """You are a Lead Auditor conducting a formal regulatory defense interview under
SOX-404 and SOC 2 Type II frameworks. You are reviewing a specific, already-resolved incident from the
IncidentZero platform's compliance ledger. You have been given the complete, factual incident dossier below,
treat every field in it as ground truth and do not speculate beyond it. Your task is to interrogate the
operator about their decisions during this incident, with particular scrutiny on any RUNBOOK_EXECUTED event
using the "Hotfix Prod Live" action, any UNATTENDED_ALERT_VIOLATION or SLA_BREACH_EMERGENCY_SANCTION event in
the raw audit log window, and whether MTTA/MTTR figures indicate a pattern inconsistent with the incident's
stated severity. Ask one focused question per turn. Respond with a JSON object matching exactly this schema:
{"reply": string, "verdict": "PENDING" | "VALID" | "JUSTIFIED" | "NON_COMPLIANT",
"regulatory_fine_adjustment": number}. Use PENDING while the interview is still in progress. Never invent
facts not present in the dossier; challenge the operator directly if their claim contradicts it."""

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


@router.get("/api/audits/postmortem/{incident_id}")
async def generate_postmortem(incident_id: str, request: Request) -> Dict[str, Any]:
    """RENDER AND PERSIST A POST-MORTEM REPORT FOR A RESOLVED INCIDENT"""
    db: OrmSession = SessionLocal()
    try:
        incident = db.get(Incident, incident_id)
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found in the compliance ledger")

        session = db.get(GameSession, incident.session_id)

        # locate the runbook execution that most likely resolved this service outage
        mitigation_entry = (
            db.query(AuditLog)
            .filter(AuditLog.event_type == "RUNBOOK_EXECUTED")
            .filter(AuditLog.details_json.like(f'%"{incident.service_id}"%'))
            .order_by(AuditLog.tick.desc())
            .first()
        )
        mitigation_name = "Manual remediation"
        mitigation_tick = incident.resolved_tick or incident.created_tick
        if mitigation_entry:
            details = json.loads(mitigation_entry.details_json)
            mitigation_name = details.get("action", mitigation_name)
            mitigation_tick = mitigation_entry.tick

        markdown = _render_template(incident, session, mitigation_name, mitigation_tick)
        report_path = _persist_report(incident_id, markdown)

        return {"incident_id": incident_id, "markdown": markdown, "saved_to": str(report_path)}
    finally:
        db.close()


def _render_template(incident: Incident, session: GameSession, mitigation_name: str, mitigation_tick: int) -> str:
    """FILL THE POST-MORTEM MARKDOWN TEMPLATE WITH INCIDENT AND SESSION CONTEXT"""
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    total_cost = 0.0
    if session:
        total_cost = float(session.budget)

    replacements = {
        "{{INCIDENT_ID}}": incident.id,
        "{{ACTOR}}": "VP_OF_INFRA",
        "{{TIMESTAMP}}": str(incident.created_tick),
        "{{TICK}}": str(incident.resolved_tick or incident.created_tick),
        "{{SEVERITY}}": incident.severity,
        "{{IMPACTED_SERVICES}}": incident.service_id,
        "{{MTTA}}": str(incident.mtta_seconds),
        "{{ACTION_TICK}}": str(mitigation_tick),
        "{{MITIGATION_NAME}}": mitigation_name,
        "{{MTTR}}": str(incident.mttr_seconds),
        "{{ROOT_CAUSE}}": incident.root_cause,
        "{{TECH_DEBT}}": str(session.tech_debt if session else "n/a"),
        "{{TOTAL_COST}}": f"{total_cost:,.2f}",
        "{{SLA_DELTA}}": f"{100 - float(session.sla_percentage):.2f}" if session else "n/a",
        "{{COMPLIANCE_STATUS}}": "Flagged" if incident.mtta_seconds >= 12 else "Clear",
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
        session = db.get(GameSession, incident.session_id)

        mitigation_entry = (
            db.query(AuditLog)
            .filter(AuditLog.event_type == "RUNBOOK_EXECUTED")
            .filter(AuditLog.details_json.like(f'%"{incident.service_id}"%'))
            .order_by(AuditLog.tick.desc())
            .first()
        )
        mitigation_name = "Manual remediation"
        mitigation_cost = 0.0
        if mitigation_entry:
            details = json.loads(mitigation_entry.details_json)
            mitigation_name = details.get("action", mitigation_name)
            mitigation_cost = float(details.get("cost", 0.0))

        timeline_events = (
            db.query(AuditLog)
            .filter(AuditLog.tick >= incident.created_tick)
            .filter(AuditLog.tick <= (incident.resolved_tick or incident.created_tick + 50))
            .order_by(AuditLog.tick.asc())
            .limit(20)
            .all()
        )

        pdf_bytes = _build_postmortem_pdf(incident, session, mitigation_name, mitigation_cost, timeline_events)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="postmortem_{incident_id}.pdf"'},
        )
    finally:
        db.close()


def _build_postmortem_pdf(
    incident: Incident,
    session: Optional[GameSession],
    mitigation_name: str,
    mitigation_cost: float,
    timeline_events: List[AuditLog],
) -> bytes:
    """DRAW THE BRANDED EXECUTIVE POST-MORTEM DOCUMENT WITH REPORTLAB"""
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
    doc.drawString(margin, y, f"Incident {incident.id}  ·  {incident.severity}")
    y -= 24

    # executive summary block
    doc.setFont("Helvetica-Bold", 11)
    doc.drawString(margin, y, "Executive Summary")
    y -= 16
    doc.setFont("Helvetica", 10)
    summary_lines = [
        f"Affected Service: {incident.service_id}",
        f"Root Cause: {incident.root_cause}",
        f"MTTA: {incident.mtta_seconds} ticks   MTTR: {incident.mttr_seconds} ticks",
        f"Compliance Status: {'Flagged' if incident.mtta_seconds >= 12 else 'Clear'}",
    ]
    for line in summary_lines:
        doc.drawString(margin, y, line)
        y -= 14
    y -= 8

    # sla impact bar, a real proportional chart driven by session data
    doc.setFont("Helvetica-Bold", 11)
    doc.drawString(margin, y, "SLA Impact")
    y -= 16
    sla_pct = float(session.sla_percentage) if session else 0.0
    bar_width = width - 2 * margin
    doc.setStrokeColor(colors.HexColor("#94a3b8"))
    doc.rect(margin, y - 12, bar_width, 12, fill=0, stroke=1)
    doc.setFillColor(colors.HexColor("#0ea5e9"))
    doc.rect(margin, y - 12, bar_width * min(1.0, sla_pct / 100.0), 12, fill=1, stroke=0)
    doc.setFillColor(colors.black)
    doc.setFont("Helvetica", 9)
    doc.drawString(margin + bar_width + 4 - 40, y - 12, f"{sla_pct:.2f}%")
    y -= 30

    # timeline of events
    doc.setFont("Helvetica-Bold", 11)
    doc.drawString(margin, y, "Timeline of Events")
    y -= 16
    doc.setFont("Helvetica", 9)
    for event in timeline_events:
        doc.drawString(margin, y, f"T+{event.tick}   {event.event_type}   (actor: {event.actor})")
        y -= 12
        if y < 160:
            break
    y -= 10

    # financial cost accounting
    doc.setFont("Helvetica-Bold", 11)
    doc.drawString(margin, y, "Financial Cost Accounting")
    y -= 16
    doc.setFont("Helvetica", 10)
    surcharge = formulas.incident_surcharge(incident.severity, incident.mttr_seconds)
    doc.drawString(margin, y, f"Incident Surcharge (final MTTR): ${surcharge:,.2f}")
    y -= 14
    doc.drawString(margin, y, f"Mitigation Applied: {mitigation_name} — ${mitigation_cost:,.2f}")
    y -= 14
    doc.drawString(margin, y, f"Session Runway at Export: ${float(session.budget):,.2f}" if session else "Session Runway at Export: n/a")
    y -= 30

    # digital auditor signature seal, an integrity stamp rather than a real cryptographic signature
    verification_code = hashlib.sha256(incident.id.encode("utf-8")).hexdigest()[:16].upper()
    seal_cx, seal_cy, seal_r = margin + 40, 90, 34
    doc.setStrokeColor(colors.HexColor("#0f172a"))
    doc.setLineWidth(1.5)
    doc.circle(seal_cx, seal_cy, seal_r, fill=0, stroke=1)
    doc.setFont("Helvetica-Bold", 8)
    doc.drawCentredString(seal_cx, seal_cy + 6, "CERTIFIED")
    doc.setFont("Helvetica", 6)
    doc.drawCentredString(seal_cx, seal_cy - 4, "DOCUMENT")
    doc.drawCentredString(seal_cx, seal_cy - 12, "INTEGRITY")
    doc.setFont("Helvetica", 8)
    export_time = datetime.now(timezone.utc).isoformat()
    doc.drawString(margin + 90, 100, f"Verification Code: {verification_code}")
    doc.drawString(margin + 90, 88, f"Exported: {export_time}")
    doc.setFont("Helvetica-Oblique", 7)
    doc.drawString(margin + 90, 76, "This seal is a document integrity stamp, not a cryptographic signature.")

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

        _persist_transcript(incident_id, transcript)
        _persist_interview_event(db, incident_id, auditor_response)

        return {
            "incident_id": incident_id,
            "reply": auditor_response["reply"],
            "verdict": auditor_response["verdict"],
            "regulatory_fine_adjustment": auditor_response["regulatory_fine_adjustment"],
            "transcript_turn": len(transcript) // 2,
        }
    finally:
        db.close()


@router.post("/api/audits/postmortem/{incident_id}/interview/apply-verdict")
async def apply_interview_verdict(incident_id: str, request: Request) -> Dict[str, Any]:
    """APPLY THE MOST RECENT INTERVIEW VERDICT'S REGULATORY FINE ADJUSTMENT TO THE LIVE SESSION BUDGET"""
    db: OrmSession = SessionLocal()
    try:
        incident = db.get(Incident, incident_id)
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found in the compliance ledger")
    finally:
        db.close()

    verdict_meta = _load_latest_verdict(incident_id)
    if not verdict_meta or verdict_meta["verdict"] == "PENDING":
        raise HTTPException(status_code=400, detail="No concluded interview verdict available to apply")

    engine = request.app.state.engine
    engine.budget = max(0.0, engine.budget - verdict_meta["regulatory_fine_adjustment"])
    engine._log_audit_event(
        event_type="AI_AUDITOR_VERDICT_APPLIED",
        actor="AUDIT_SYSTEM",
        details={
            "incident_id": incident_id,
            "verdict": verdict_meta["verdict"],
            "amount": verdict_meta["regulatory_fine_adjustment"],
        },
        compliance_flag=verdict_meta["verdict"] != "NON_COMPLIANT",
    )
    return {"success": True, "budget": engine.budget}


def _compile_interview_context(db: OrmSession, incident: Incident, session: GameSession) -> Dict[str, Any]:
    """ASSEMBLE THE FULL INCIDENT DOSSIER THE AI AUDITOR PERSONA IS GROUNDED IN"""
    runbook_events = (
        db.query(AuditLog)
        .filter(AuditLog.event_type == "RUNBOOK_EXECUTED")
        .filter(AuditLog.details_json.like(f'%"{incident.service_id}"%'))
        .order_by(AuditLog.tick.asc())
        .all()
    )
    all_incident_related_logs = (
        db.query(AuditLog)
        .filter(AuditLog.tick >= incident.created_tick)
        .filter(AuditLog.tick <= (incident.resolved_tick or incident.created_tick + 50))
        .order_by(AuditLog.tick.asc())
        .all()
    )
    return {
        "incident_id": incident.id,
        "title": incident.title,
        "severity": incident.severity,
        "service_id": incident.service_id,
        "root_cause": incident.root_cause,
        "mtta_ticks": incident.mtta_seconds,
        "mttr_ticks": incident.mttr_seconds,
        "status": incident.status,
        "created_tick": incident.created_tick,
        "resolved_tick": incident.resolved_tick,
        "tech_debt_at_review_time": session.tech_debt if session else None,
        "sla_percentage_at_review_time": float(session.sla_percentage) if session else None,
        "runbooks_executed": [
            {
                "tick": e.tick,
                "action": json.loads(e.details_json).get("action"),
                "cost": json.loads(e.details_json).get("cost"),
            }
            for e in runbook_events
        ],
        "raw_audit_log_window": [
            {
                "tick": e.tick,
                "event_type": e.event_type,
                "actor": e.actor,
                "details": json.loads(e.details_json),
                "compliance_flag": e.compliance_flag,
            }
            for e in all_incident_related_logs
        ],
    }


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
        return {
            "reply": parsed["reply"],
            "verdict": parsed.get("verdict", "PENDING"),
            "regulatory_fine_adjustment": float(parsed.get("regulatory_fine_adjustment", 0.0)),
        }
    except (httpx.HTTPError, json.JSONDecodeError, KeyError):
        # malformed or unreachable model response: fail into a neutral holding pattern rather than
        # crashing the interview or fabricating a verdict the model did not actually produce
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


def _persist_interview_event(db: OrmSession, incident_id: str, auditor_response: Dict[str, Any]) -> None:
    """RECORD AN AI AUDITOR INTERVIEW TURN AS A GOVERNANCE LEDGER ENTRY AND CACHE ITS VERDICT"""
    incident = db.get(Incident, incident_id)
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
                    "regulatory_fine_adjustment": auditor_response["regulatory_fine_adjustment"],
                }
            ),
            compliance_flag=auditor_response["verdict"] != "NON_COMPLIANT",
        )
    )
    db.commit()

    # cache the latest verdict separately so apply-verdict does not need to replay the audit log
    INTERVIEWS_DIR.mkdir(parents=True, exist_ok=True)
    verdict_path = INTERVIEWS_DIR / f"{incident_id}.verdict.json"
    verdict_path.write_text(
        json.dumps(
            {
                "verdict": auditor_response["verdict"],
                "regulatory_fine_adjustment": auditor_response["regulatory_fine_adjustment"],
            }
        ),
        encoding="utf-8",
    )
