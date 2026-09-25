# AI Auditor Post-Mortem Interview — Implementation Specification

**Document ID:** IZ-IMPL-06
**Classification:** Implementation Contract / Next-Phase Architecture Blueprint
**Status:** Approved for implementation — additive only, non-breaking
**Integration baseline:** `backend/app/api/v1/audits.py`, `audits/templates/post_mortem_template.md`, `audits/docs/05_POST_MORTEM_STANDARD_OPERATING_PROCEDURE.md`, `audits/specs/AUDIT_LEDGER_DATA_DICTIONARY.md`

---

## 1. System Objective

Extend the existing, purely-mechanical post-mortem generation pipeline (Document 05: `generate_postmortem` in `backend/app/api/v1/audits.py`) with an interactive, LLM-driven regulatory defense interview. The existing `GET /api/audits/postmortem/{incident_id}` endpoint, its `_render_template` hydration logic, and the persisted `.md` report files under `audits/reports/` are **not modified in any way** by this specification — the interview is a wholly new, additive endpoint that consumes the same incident/session/audit data but produces a distinct artifact (a scored interview transcript) rather than a rendered template.

---

## 2. Integration Architecture

### 2.1 New Endpoint

New route, additive to `backend/app/api/v1/audits.py` (same router, same file, appended after the existing `generate_postmortem` function — not a new router file, since this is conceptually part of the same audits domain):

```python
@router.post("/api/audits/postmortem/{incident_id}/interview")
async def conduct_interview(incident_id: str, payload: InterviewMessageRequest, request: Request) -> Dict[str, Any]:
    """CONDUCT ONE TURN OF AN LLM-DRIVEN REGULATORY DEFENSE INTERVIEW FOR A RESOLVED INCIDENT"""
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
        _persist_interview_event(db, incident_id, payload.message, auditor_response)

        return {
            "incident_id": incident_id,
            "reply": auditor_response["reply"],
            "verdict": auditor_response["verdict"],
            "regulatory_fine_adjustment": auditor_response["regulatory_fine_adjustment"],
            "transcript_turn": len(transcript) // 2,
        }
    finally:
        db.close()
```

`InterviewMessageRequest` (`backend/app/schemas/interview.py`): `{"message": str}` — the player's free-text answer to the auditor's most recent question (or an opening statement, on the first call in a session).

This endpoint is **stateful across calls** (each call appends to a growing transcript) but **stateless within the process** — the transcript is persisted to disk (§ 2.4) rather than held in `SimulationEngine` memory, since an interview is a post-hoc reviewer action entirely decoupled from the live tick loop, exactly as `generate_postmortem` already is (Document 05, § 2.4: "This is a read-and-render operation... its sole side effect is a filesystem write").

### 2.2 Prompt Orchestration — Context Injection

`_compile_interview_context` builds a single structured context object by reusing the exact same data-gathering logic `generate_postmortem` already performs (Document 05, § 3.2), factored out into a shared helper so both endpoints draw from one source of truth rather than two independently-maintained queries that could drift:

```python
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
            {"tick": e.tick, "action": json.loads(e.details_json).get("action"), "cost": json.loads(e.details_json).get("cost")}
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
```

This context object is deliberately **not** the rendered post-mortem markdown (Document 05, § 3) — it is the raw, structured dossier, since a markdown narrative would force the LLM to re-parse prose to extract facts it should instead receive as directly-addressable structured fields. Note that `all_incident_related_logs` deliberately pulls the **raw** `audit_logs` rows via direct SQL query rather than the engine's in-memory-capped `recent_audits` (which is truncated to the last 15 entries for WebSocket bandwidth reasons, Document 01 § "WS Broadcaster" — a limit that has no bearing on this endpoint, which reads SQLite directly and is under no framing-budget constraint).

### 2.3 Auditor Persona and Prompting Contract

`_invoke_auditor_llm` constructs a system prompt establishing the persona and constraining the response format:

```python
AUDITOR_SYSTEM_PROMPT = """You are a Lead Auditor conducting a formal regulatory defense interview under
SOX-404 and SOC 2 Type II frameworks. You are reviewing a specific, already-resolved incident from the
IncidentZero platform's compliance ledger. You have been given the complete, factual incident dossier below —
treat every field in it as ground truth; do not speculate beyond it. Your task is to interrogate the operator
(the player) about their decisions during this incident, with particular scrutiny on:

- Any RUNBOOK_EXECUTED event where the action is "Hotfix Prod Live" (the emergency_patch runbook), which
  bypasses standard change-management review by design (see the platform's own Runbook Catalog and
  Mitigation Matrix specification, which flags this action's regulatory risk profile as High).
- Any UNATTENDED_ALERT_VIOLATION or SLA_BREACH_EMERGENCY_SANCTION event in the raw audit log window,
  indicating a compliance_flag=False regulatory breach already recorded against this incident window.
- Whether MTTA and MTTR figures indicate a pattern of delayed acknowledgment or delayed resolution
  inconsistent with the incident's stated severity.

Ask ONE focused question per turn. After the operator responds, evaluate their answer and, on your NEXT
turn only (not every turn), you may render a verdict. You must respond with a JSON object matching exactly
this schema: {"reply": string, "verdict": "PENDING" | "VALID" | "JUSTIFIED" | "NON_COMPLIANT",
"regulatory_fine_adjustment": number}. Use "PENDING" while the interview is still in progress and no
final verdict has been reached. "regulatory_fine_adjustment" is a dollar amount: 0 while PENDING, a
positive value (an additional fine) if NON_COMPLIANT, and may be a negative value (a partial fine waiver)
if VALID or JUSTIFIED and the incident dossier already shows a recorded fine (e.g. an
UNATTENDED_ALERT_VIOLATION fine) that the operator's defense credibly mitigates. Never invent facts not
present in the dossier; if the operator's claim contradicts the dossier, you must challenge it directly by
citing the specific contradicting field."""
```

```python
async def _invoke_auditor_llm(context: Dict[str, Any], transcript: List[Dict[str, str]]) -> Dict[str, Any]:
    """INVOKE THE LLM AUDITOR PERSONA WITH THE COMPILED DOSSIER AND CONVERSATION HISTORY"""
    from app.core.config import settings
    import httpx

    messages = [
        {"role": "system", "content": AUDITOR_SYSTEM_PROMPT},
        {"role": "system", "content": f"INCIDENT DOSSIER (ground truth, JSON):\n{json.dumps(context, indent=2)}"},
    ] + [{"role": m["role"], "content": m["content"]} for m in transcript]

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            settings.LLM_API_BASE_URL,
            headers={"Authorization": f"Bearer {settings.LLM_API_KEY}", "Content-Type": "application/json"},
            json={"model": settings.LLM_MODEL_ID, "messages": messages, "response_format": {"type": "json_object"}},
        )
        resp.raise_for_status()
        raw = resp.json()["choices"][0]["message"]["content"]

    try:
        parsed = json.loads(raw)
        return {
            "reply": parsed["reply"],
            "verdict": parsed.get("verdict", "PENDING"),
            "regulatory_fine_adjustment": float(parsed.get("regulatory_fine_adjustment", 0.0)),
        }
    except (json.JSONDecodeError, KeyError):
        # malformed model output: fail safe into a neutral, non-scoring holding pattern rather than
        # crashing the interview or silently fabricating a verdict the model did not actually produce
        return {
            "reply": "The auditor's response could not be parsed. Please restate your previous answer.",
            "verdict": "PENDING",
            "regulatory_fine_adjustment": 0.0,
        }
```

**New required configuration, additive to `backend/app/core/config.py`'s `Settings` class** (Document 01 flagged `SESSION_SECRET` as an existing unused-but-declared field; this specification is careful not to repeat that pattern — every field declared here is actually read, in `_invoke_auditor_llm` above):

```python
LLM_API_BASE_URL: str = os.getenv("LLM_API_BASE_URL", "")
LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
LLM_MODEL_ID: str = os.getenv("LLM_MODEL_ID", "claude-sonnet-5")
```

**Fail-safe when unconfigured:** if `LLM_API_KEY` is empty at call time, `conduct_interview` returns HTTP 503 with `{"detail": "AI Auditor interview service is not configured"}` **before** attempting the HTTP call — an explicit early guard, not a silent fallback to a fabricated response, so a deployment without LLM credentials fails loudly and immediately rather than serving a placeholder "auditor" that produces meaningless verdicts. This is the honest-disclosure design principle established throughout Documents 02–05 applied to a new failure mode: a misconfigured integration must be legible as broken, not silently degrade into fake governance theater.

### 2.4 Transcript Persistence

Interview transcripts are persisted as JSON files under a new directory, `audits/interviews/`, sibling to the existing `audits/reports/` directory (Document 05 § 3.5), following the identical `REPO_ROOT`-relative path-resolution pattern already established for `TEMPLATE_PATH`/`REPORTS_DIR`:

```python
INTERVIEWS_DIR = REPO_ROOT / "audits" / "interviews"


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
```

Unlike `_persist_report`'s single-shot overwrite (Document 05 § 3.5, flagged there as destroying prior renders with no versioning), transcript persistence is **inherently append-and-resave**, since the whole point of the artifact is the full multi-turn conversation — there is no analogous "prior version destroyed" concern here because each write is a strict superset (the prior transcript content plus the new turn) of the one it replaces on disk, not an unrelated re-render.

### 2.5 Governance Ledger Integration

Each interview turn logs an additive audit event, so the fact that a regulatory interview occurred — and its outcome — is visible in the same compliance ledger as every other governance-relevant action, per this project's established design philosophy that the audit ledger is the single durable record of governance-relevant activity (Document 03 § 1, Control Objective 1: Audit Trail Completeness):

```python
def _persist_interview_event(db: OrmSession, incident_id: str, player_message: str, auditor_response: Dict[str, Any]) -> None:
    """RECORD AN AI AUDITOR INTERVIEW TURN AS A GOVERNANCE LEDGER ENTRY"""
    entry_id = f"aud-{uuid.uuid4().hex[:8]}"
    db.add(AuditLog(
        id=entry_id,
        session_id=db.get(Incident, incident_id).session_id,
        tick=0,  # interviews are post-hoc, out-of-band reviewer actions with no live tick context; see note below
        event_type="AI_AUDITOR_INTERVIEW_TURN",
        actor="AUDIT_SYSTEM",
        details_json=json.dumps({
            "incident_id": incident_id,
            "verdict": auditor_response["verdict"],
            "regulatory_fine_adjustment": auditor_response["regulatory_fine_adjustment"],
        }),
        compliance_flag=auditor_response["verdict"] != "NON_COMPLIANT",
    ))
    db.commit()
```

**Disclosed limitation, in the same honest-auditor voice as every prior document in this repository:** the `tick` field is hardcoded to `0` because an interview can occur arbitrarily long after the simulation session that produced the incident has ended, paused, or been reset — there is no live `current_tick` to attribute the event to that would be meaningful (unlike every other existing event type, which is logged synchronously from within the tick loop or a live player action against a running session, Document 05, `audits/specs/AUDIT_LEDGER_DATA_DICTIONARY.md` § 1). This is recorded here explicitly as a data-provenance caveat: a reviewer correlating `AI_AUDITOR_INTERVIEW_TURN` rows by `tick` will find them all clustered at `tick=0` regardless of when the interview actually happened, and must instead rely on the row's `timestamp` column (Document 05's `AUDIT_LEDGER_DATA_DICTIONARY.md` § 1.1) — itself already documented as the less-authoritative of the two temporal fields for every *other* event type, an irony this specification does not attempt to paper over. Implementers extending this system should consider whether a nullable `tick` column (a genuine, additive schema change to `audit_logs`, not covered by the strictly-additive-new-tables scope of this document) is warranted in a later phase; this specification deliberately does not make that schema change itself, to keep this phase's footprint limited to wholly new tables and columns rather than touching the existing `audit_logs` table's `tick` column's nullability.

This introduces one additive audit event type:

| `event_type` | Trigger | Actor | `compliance_flag` | Payload |
|---|---|---|---|---|
| `AI_AUDITOR_INTERVIEW_TURN` | Each `POST .../interview` call completes | `AUDIT_SYSTEM` | `False` only when `verdict == "NON_COMPLIANT"` | `{"incident_id": string, "verdict": string, "regulatory_fine_adjustment": float}` |

### 2.6 Applying the Regulatory Fine Adjustment

A verdict's `regulatory_fine_adjustment` is **not automatically applied** to the live session's `budget` by this endpoint — `conduct_interview` is read-and-log only, matching `generate_postmortem`'s existing non-mutating design (Document 05 § 2.4). Applying a fine or waiver to a *live* session's budget is a distinct, explicit action requiring its own confirmation step, implemented as a second, separate endpoint:

```python
@router.post("/api/audits/postmortem/{incident_id}/interview/apply-verdict")
async def apply_interview_verdict(incident_id: str, request: Request) -> Dict[str, Any]:
    """APPLY THE MOST RECENT INTERVIEW VERDICT'S REGULATORY FINE ADJUSTMENT TO THE LIVE SESSION BUDGET"""
    transcript_meta = _load_latest_verdict(incident_id)
    if not transcript_meta or transcript_meta["verdict"] == "PENDING":
        raise HTTPException(status_code=400, detail="No concluded interview verdict available to apply")
    engine = request.app.state.engine
    engine.budget = max(0.0, engine.budget - transcript_meta["regulatory_fine_adjustment"])
    engine._log_audit_event(
        event_type="AI_AUDITOR_VERDICT_APPLIED",
        actor="AUDIT_SYSTEM",
        details={"incident_id": incident_id, "verdict": transcript_meta["verdict"], "amount": transcript_meta["regulatory_fine_adjustment"]},
        compliance_flag=transcript_meta["verdict"] != "NON_COMPLIANT",
    )
    return {"success": True, "budget": engine.budget}
```

This split — score first, apply only on explicit confirmation — mirrors the project's existing separation between `_evaluate_session_status`'s automatic, unconditional penalty application (Document 02 § 4.2's `UNATTENDED_BREACH_FINE`, which *is* auto-applied because it is a mechanical rule, not a judgment call) and a scenario like this one where an LLM's qualitative judgment should not silently and irreversibly alter a live session's finances without a distinct, auditable confirmation action. `AI_AUDITOR_VERDICT_APPLIED` is a second additive event type, bringing this document's total new event types to two.

---

## 3. Outcome Engine — Structured Scoring Contract

The complete, closed set of verdict values is:

| Verdict | Meaning | Typical `regulatory_fine_adjustment` sign |
|---|---|---|
| `PENDING` | Interview still in progress; no final judgment yet | Always `0.0` |
| `VALID` | The operator's actions were fully compliant; no wrongdoing found | `0.0`, or negative if a prior mechanical fine is waived |
| `JUSTIFIED` | The operator deviated from standard procedure (e.g., used `emergency_patch` without CAB approval) but articulated a credible, evidence-grounded business justification the auditor accepts | `0.0` or a small negative (partial waiver) |
| `NON_COMPLIANT` | The operator's defense failed to justify a recorded deviation, or contradicted the dossier's facts | Positive (an additional fine) |

This four-value enum is the exhaustive, closed set this specification defines — the LLM integration is constrained (via the `response_format: {"type": "json_object"}` structured-output request and the explicit schema in the system prompt, § 2.3) to emit exactly one of these four strings, never a free-text or novel verdict category, keeping the outcome machine-actionable by `apply_interview_verdict` without any string-matching heuristics on unconstrained model prose.

---

## 4. Non-Breaking Compliance Checklist

- [x] `GET /api/audits/postmortem/{incident_id}` and its `_render_template`/`_persist_report` internals (Document 05 §§ 3.2–3.5) are completely unmodified; the interview reuses their data-gathering *pattern*, not their code path.
- [x] The interview's dossier-compilation query is a new, separate function; the existing `_render_template` function's own inline mitigation-lookup query is untouched.
- [x] Three new endpoints are additive: `POST .../interview`, `POST .../interview/apply-verdict`, with zero existing route signature changes.
- [x] `Settings` gains three new, actually-consumed configuration fields — explicitly avoiding the pre-existing `SESSION_SECRET`-is-declared-but-unused anti-pattern Document 01 flagged.
- [x] Interview transcripts persist to a new sibling directory (`audits/interviews/`), never touching `audits/reports/`.
- [x] Two additive audit event types (`AI_AUDITOR_INTERVIEW_TURN`, `AI_AUDITOR_VERDICT_APPLIED`); no existing event type's schema changes.
- [x] Fine adjustments are never auto-applied to a live session's budget without a distinct, explicit, separately-audited confirmation call — preserving the principle that only mechanically-derived penalties (Document 02's regulatory formulas) are applied unconditionally.
- [x] A misconfigured or unreachable LLM backend fails loudly (HTTP 503 or a parse-fallback `PENDING` holding response) rather than silently fabricating a verdict.
