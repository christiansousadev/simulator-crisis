# AI Auditor Post-Mortem Interview — Implementation Specification

**Document ID:** IZ-IMPL-06  
**Classification:** Technical Specification / Regulatory Interview & AI Governance  
**Status:** Backend e interface de chat implementados e verificados contra o código (Outubro 2026); ver § 2.7  
**Last Updated:** Outubro 2026  
**Source of Truth:** `backend/app/api/v1/audits.py` (dossier, interview, apply-verdict and PDF code all live here; there is no `backend/app/reports/` package), `backend/app/engine/formulas.py`, `backend/app/schemas/interview.py`, `backend/app/core/config.py`, `frontend/src/components/auditor/*`, `frontend/src/components/modals/PostMortemModal.tsx`, `frontend/src/i18n/auditorChat.ts`

---

## 1. System Objective

Extend the existing, purely-mechanical post-mortem generation pipeline (Document 05: `generate_postmortem` in `backend/app/api/v1/audits.py`) with an interactive, LLM-driven regulatory defense interview. The existing `GET /api/audits/postmortem/{incident_id}` endpoint, its `_render_template` hydration logic, and the persisted `.md` report files under `audits/reports/` are separate from the interview: the interview is an additional endpoint that consumes the same incident dossier (`_build_incident_dossier`, shared with the markdown report and the PDF export) but produces a distinct artifact (a scored interview transcript) rather than a rendered template.

---

## 2. Integration Architecture

### 2.1 Interview Endpoint

Route in `backend/app/api/v1/audits.py` (same router as the post-mortem endpoints):

```python
@router.post("/api/audits/postmortem/{incident_id}/interview")
async def conduct_interview(incident_id: str, payload: InterviewMessageRequest, request: Request) -> Dict[str, Any]:
    """CONDUCT ONE TURN OF AN LLM-DRIVEN REGULATORY DEFENSE INTERVIEW FOR A RESOLVED INCIDENT"""
    if not settings.LLM_API_KEY:
        raise HTTPException(status_code=503, detail="AI Auditor interview service is not configured")
    _check_interview_rate_limit(request.client.host if request.client else "unknown")   # 429 when exceeded
    # 404 if the incident is not in the ledger; then:
    context = _compile_interview_context(db, incident, session)
    transcript = _load_or_init_transcript(incident_id) + [{"role": "player", "content": payload.message}]
    auditor_response = await _invoke_auditor_llm(context, transcript)
    transcript.append({"role": "auditor", "content": auditor_response["reply"]})
    eligible_amount = formulas.eligible_audit_adjustment(
        auditor_response["verdict"], auditor_response["regulatory_fine_adjustment"], incident.severity
    )
    _persist_transcript(incident_id, transcript)
    _persist_interview_event(db, incident_id, auditor_response, eligible_amount)
    return {
        "incident_id": incident_id,
        "reply": auditor_response["reply"],
        "verdict": auditor_response["verdict"],
        "regulatory_fine_adjustment": eligible_amount,   # the backend-clamped preview, never the raw LLM proposal
        "transcript_turn": len(transcript) // 2,
    }
```

`InterviewMessageRequest` (`backend/app/schemas/interview.py`): `{"message": str}` with `min_length=1`, `max_length=2000` (the body is forwarded verbatim, with the dossier, to a paid external API, so an unbounded body would be a spend-amplification vector).

**Guards, in order:** (1) HTTP 503 when `LLM_API_KEY` is empty; (2) an in-process sliding-window rate limit of **10 interview turns per 60 seconds per client IP** (HTTP 429; single process, resets on restart, IP-keyed, so it only closes the trivial "loop it as fast as possible" path and is not a substitute for real auth/quota infrastructure); (3) HTTP 404 for an unknown incident.

The endpoint is **stateful across calls** (each call appends to a growing transcript) but the transcript lives on disk (§ 2.4) rather than in `SimulationEngine` memory, since an interview is a post-hoc reviewer action decoupled from the live tick loop. Note that the REST state-push middleware deliberately skips `.../interview` (it never mutates engine state) but does push after a successful `.../interview/apply-verdict`.

### 2.2 Prompt Orchestration — Context Injection

`_compile_interview_context(db, incident, session)` reuses **`_build_incident_dossier`**, the single factual record that also feeds the markdown post-mortem and the PDF export, so the auditor never sees a different version of events than the player does:

```python
dossier = _build_incident_dossier(db, incident)
session_context = {"tech_debt_current": ..., "sla_percentage_current": ..., "note": "Session-wide, as of right now -- NOT specific to this incident ..."}
return {**dossier, "session_context": session_context}   # session_context is None when the session row is gone
```

The dossier contains the incident's identity and severity, `mtta_ticks`/`mttr_ticks`, `root_cause` (only if confirmed through triage, otherwise `null`), point-in-time `tech_debt_at_creation`/`tech_debt_at_resolution`/`tech_debt_delta`, a `financial_impact` block (accrued surcharge, mitigation cost, regulatory fines, auditor credits), `mitigations`, a `timeline`, `compliance_status`, and a labelled `concurrent_context` of session-wide events (SLA sanction, feature freeze, dilemmas, risk windows) that are explicitly *not* attributed to this incident. Incident-scoped events are matched by exact `incident_id` equality in the audit payload (never by service-id substring or "most recent event on this service"), and the dossier never reads the live session's budget/tech-debt/SLA to reconstruct the past. The raw `audit_logs` rows are read directly from SQLite, so the WebSocket `recent_audits` cap does not apply.

### 2.3 Auditor Persona and Prompting Contract

`AUDITOR_SYSTEM_PROMPT` (a module constant in `audits.py`; the file is authoritative, this is a summary) establishes a Lead Auditor interviewing under SOX-404 and SOC 2 Type II, treats the dossier as ground truth, tells the model that a `null` `root_cause` means the operator never confirmed the cause (challenge that gap, do not invent one), forbids presenting `concurrent_context` as this incident's own impact, asks for particular scrutiny of `Hotfix Prod Live` runbook executions, `UNATTENDED_ALERT_VIOLATION` events and MTTA/MTTR patterns, and requires one focused question per turn and a JSON reply of exactly `{"reply": string, "verdict": "PENDING" | "VALID" | "JUSTIFIED" | "NON_COMPLIANT", "regulatory_fine_adjustment": number}`. The prompt tells the model that the amount is only a recommendation and that the platform independently computes the eligible amount.

`_invoke_auditor_llm` posts `{model, messages: [system prompt, dossier JSON, transcript...], response_format: {"type": "json_object"}}` with `httpx.AsyncClient(timeout=30.0)` to `settings.LLM_API_BASE_URL` (the **full chat-completions URL** of any OpenAI-compatible provider, used as given) with `Authorization: Bearer <LLM_API_KEY>`. The model output is **untrusted**: it must parse as a JSON object, `verdict` must be one of the four allowed values (anything else becomes `PENDING`, otherwise a typo'd verdict would be read as "not NON_COMPLIANT", i.e. compliant), `reply` is truncated to 4,000 characters, and `regulatory_fine_adjustment` must be numeric. Any transport error, HTTP error, empty `choices`, malformed JSON or non-numeric amount returns the neutral holding response `{"reply": "The auditor's response could not be parsed. Please restate your previous answer.", "verdict": "PENDING", "regulatory_fine_adjustment": 0.0}` instead of crashing or fabricating a verdict.

**Configuration (`backend/app/core/config.py`, `Settings`):**

```python
LLM_API_BASE_URL: str = os.getenv("LLM_API_BASE_URL", "")
LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
LLM_MODEL_ID: str = os.getenv("LLM_MODEL_ID", "claude-sonnet-5")
```

**Fail-safe when unconfigured:** an empty `LLM_API_KEY` returns HTTP 503 `{"detail": "AI Auditor interview service is not configured"}` before any HTTP call. There is **no offline fallback and no canned auditor**: a deployment without credentials fails loudly rather than serving fake governance theater. (The guard checks the key only: with a key but an empty or wrong `LLM_API_BASE_URL` the call fails inside `_invoke_auditor_llm` and the turn degrades to the `PENDING` holding response.)

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

Alongside the transcript, `_persist_interview_event` writes a small verdict cache, `audits/interviews/<incident_id>.verdict.json` (`{"verdict", "proposed_amount", "applied": false}`), which `apply-verdict` reads. Unlike `_persist_report`'s single-shot overwrite (Document 05 § 3.5, flagged there as destroying prior renders with no versioning), transcript persistence is **inherently append-and-resave**, since the whole point of the artifact is the full multi-turn conversation — there is no analogous "prior version destroyed" concern here because each write is a strict superset (the prior transcript content plus the new turn) of the one it replaces on disk, not an unrelated re-render.

### 2.5 Governance Ledger Integration

Each interview turn logs an additive audit event, so the fact that a regulatory interview occurred — and its outcome — is visible in the same compliance ledger as every other governance-relevant action, per this project's established design philosophy that the audit ledger is the single durable record of governance-relevant activity (Document 03 § 1, Control Objective 1: Audit Trail Completeness):

```python
def _persist_interview_event(db: OrmSession, incident_id: str, auditor_response: Dict[str, Any], eligible_amount: float) -> None:
    """RECORD AN AI AUDITOR INTERVIEW TURN AS A GOVERNANCE LEDGER ENTRY AND CACHE ITS VERDICT"""
    db.add(AuditLog(
        id=f"aud-{uuid.uuid4().hex[:8]}",
        session_id=incident.session_id,
        tick=0,  # interviews are post-hoc, out-of-band reviewer actions with no live tick context; see note below
        event_type="AI_AUDITOR_INTERVIEW_TURN",
        actor="AUDIT_SYSTEM",
        details_json=json.dumps({
            "incident_id": incident_id,
            "verdict": auditor_response["verdict"],
            "proposed_amount": round(auditor_response["regulatory_fine_adjustment"], 2),
            "eligible_amount": round(eligible_amount, 2),
        }),
        compliance_flag=auditor_response["verdict"] != "NON_COMPLIANT",
    ))
    db.commit()
    # ... then writes <incident_id>.verdict.json with applied=False (a fresh verdict is always unapplied)
```

**Disclosed limitation, in the same honest-auditor voice as every prior document in this repository:** the `tick` field is hardcoded to `0` because an interview can occur arbitrarily long after the simulation session that produced the incident has ended, paused, or been reset — there is no live `current_tick` to attribute the event to that would be meaningful (unlike every other existing event type, which is logged synchronously from within the tick loop or a live player action against a running session, Document 05, `audits/specs/AUDIT_LEDGER_DATA_DICTIONARY.md` § 1). This is recorded here explicitly as a data-provenance caveat: a reviewer correlating `AI_AUDITOR_INTERVIEW_TURN` rows by `tick` will find them all clustered at `tick=0` regardless of when the interview actually happened, and must instead rely on the row's `timestamp` column (Document 05's `AUDIT_LEDGER_DATA_DICTIONARY.md` § 1.1) — itself already documented as the less-authoritative of the two temporal fields for every *other* event type, an irony this specification does not attempt to paper over. Implementers extending this system should consider whether a nullable `tick` column (a schema change to `audit_logs`, which would need its own Alembic revision) is warranted in a later phase; it is not made here.

This introduces the following audit event type (the verdict-application event is described in § 2.6):

| `event_type` | Trigger | Actor | `compliance_flag` | Payload |
|---|---|---|---|---|
| `AI_AUDITOR_INTERVIEW_TURN` | Each `POST .../interview` call completes | `AUDIT_SYSTEM` | `False` only when `verdict == "NON_COMPLIANT"` | `{"incident_id": string, "verdict": string, "proposed_amount": float, "eligible_amount": float}` |

### 2.6 Applying the Regulatory Fine Adjustment & Backend Financial Authority

The AI Auditor functions as an advisory and investigative agent: **the LLM may analyze and propose adjustments, but the backend is the sole authority deciding what is financially applicable.**

Applying a fine or credit requires an explicit call to `POST /api/audits/postmortem/{incident_id}/interview/apply-verdict` (no body; success returns `{"success": true, "budget": <new budget>}`). The backend enforces the following controls:

1. **Session & Incident Association:** unknown incident -> HTTP 404; `incident.session_id != engine.session_id` -> HTTP 400 (an incident from a previous or different session cannot be applied against the live session).
2. **A concluded verdict must exist:** HTTP 400 `"No concluded interview verdict available to apply"` when there is no cached verdict or the latest one is `PENDING`.
3. **Dual-layer idempotency:**
   - **Cache-layer guard:** if the cached verdict's `applied` flag is set, the call is rejected (HTTP 400, "already been applied").
   - **Ledger-layer guard (`_verdict_already_applied`):** looks for any `AI_AUDITOR_VERDICT_APPLIED` audit row whose payload carries the same `incident_id`; if found it self-heals the cache flag and rejects with HTTP 400. Because this check is keyed on `incident_id` alone, **a verdict can be applied at most once per incident**: a later interview turn produces a fresh, unapplied cache entry, but the ledger guard still blocks it once any verdict was applied for that incident. The flag is written only after the financial event has gone through, so a failed application never blocks a legitimate retry.
4. **Safe parsing and non-finite guards:** the LLM output is untrusted. A non-finite `proposed_amount` (`NaN`, `+/-Infinity`) is zeroed to `0.0` by `formulas.eligible_audit_adjustment()` rather than pinned to a floor/ceiling (pinning to the credit floor would hand out the largest possible credit).
5. **Deterministic backend clamping (`formulas.eligible_audit_adjustment(verdict, proposed_amount, severity)`)**, re-derived at application time from the cached proposal, never trusted from the cache:
   - **`NON_COMPLIANT`:** a non-negative fine in $[0, \text{ceiling}]$ with `AUDIT_FINE_CEILING_BY_SEVERITY`: `P1_CRITICAL` \$6,000.00, `P2_HIGH` \$3,000.00, `P3_MEDIUM` \$1,500.00, `P4_LOW` \$750.00 (an unrecognized severity falls back to the `P4_LOW` ceiling).
   - **`VALID` / `JUSTIFIED`:** a non-positive credit in $[-2000.0, 0.0]$ (`AUDIT_CREDIT_CEILING = 2000.0`).
   - **`PENDING` / anything else:** exactly \$0.00.
6. **Centralized financial ledger integration:** the amount is applied through `engine._apply_financial_event(category="regulatory_fine", amount=-eligible_amount, reference=incident_id, audit_event_type="AI_AUDITOR_VERDICT_APPLIED", actor="AUDIT_SYSTEM", compliance_flag=verdict != "NON_COMPLIANT", ...)`, so the budget change, the ledger entry and the audit row come from one call. The `AI_AUDITOR_VERDICT_APPLIED` payload is `{"incident_id", "verdict", "proposed_amount", "eligible_amount"}`, and the event is restored into the in-memory financial ledger after a restart. The incident dossier/PDF then shows the fine under `regulatory_fines` or the credit under `audit_credits`.

### 2.7 Client UI (post-mortem dialog, "Auditor" tab)

`PostMortemModal` has two section buttons (`aria-pressed`, deliberately not `role="tab"`): **Report** (the markdown document, default) and **Auditor**. The auditor section (`components/auditor/AuditorChat.tsx`, state in `auditorChatState.ts`, copy in the `auditorChat` i18n namespace) lives inside the same lazy chunk, is mounted on first visit and then kept, so a half-typed answer survives a look at the report. Copy, PDF export and replay stay in the footer for both sections.

- **Explanation:** a short note that the server, not the AI, decides any fine or credit, capped by severity.
- **Transcript:** `role="log"` + `aria-live="polite"`; auditor and operator bubbles; a typing indicator while a turn is pending (a static ellipsis under reduced motion). On open, `GET .../interview` resumes a saved conversation; a `404` simply means a fresh one.
- **Composer:** textarea with the backend bound (2,000 characters, `maxLength` and a live counter); Send is disabled while pending or when the trimmed text is empty; Ctrl/Cmd+Enter sends. The message is trimmed before sending.
- **Verdict:** a chip (`PENDING` neutral, `VALID`/`JUSTIFIED` emerald, `NON_COMPLIANT` rose) plus the backend-clamped preview ("Proposed: -US$1,500 credit (cap US$2,000)" / "Proposed: +US$3,000 fine (cap US$6,000)"). Every figure shown is the backend's; the LLM's raw number never reaches the client.
- **Apply verdict:** enabled only for a final verdict with a non-zero eligible amount, not yet applied, and nothing pending. On success it shows the `applied_amount` returned by `apply-verdict`, pushes a toast (`pushFloatingText`, `danger` for a fine, `success` for a credit) and the button becomes **Applied**. The backend's "already been applied" 400 is mapped to the same Applied state; any other 400 (for example an incident from a past session) shows the backend message and leaves the button usable.
- **Errors (`classifyChatError`):** `503` renders a calm "not configured on this server" empty state with the `LLM_API_KEY` how-to and no retry (the composer is disabled but the typed text is kept); `429` shows "wait a moment" (with the seconds when `Retry-After` is readable) and a Retry button; a network failure or any other status shows an inline message with Retry. On any failure the optimistic bubble is removed and the typed message is restored, so nothing is lost.

`services/api.ts` throws `ApiError` (an `Error` subclass carrying `status` and `retryAfterSeconds`) and exposes `conductInterview`, `getInterview` and `applyInterviewVerdict`. Unit tests: `auditorChatState.test.ts` (reducer, error mapping, apply states) and `AuditorChat.test.tsx` (mocked `fetch`: send, reply, verdict, apply, 503, 429 + retry, already-applied).

**Read endpoint and response additions** (this change; all additive):

- `GET /api/audits/postmortem/{incident_id}/interview` returns `{incident_id, turns: [{role: "player"|"auditor", content}], verdict, regulatory_fine_adjustment, adjustment_cap, applied, transcript_turn}`. It is read-only, needs no `LLM_API_KEY`, never calls the LLM and re-clamps the cached proposal with `formulas.eligible_audit_adjustment`. The id must match `^[A-Za-z0-9_-]{1,64}$` and exist in the ledger before any file path is built (`404` otherwise, also when no transcript exists); corrupt cache files degrade to `PENDING`/`0`.
- `POST .../interview` also returns `adjustment_cap` (magnitude of the ceiling for that verdict and the incident's severity, `0` for `PENDING`) and `applied`; its `429` carries `Retry-After` seconds. CORS does not expose that header cross-origin (`expose_headers` is not set), so the UI falls back to the generic wait message there.
- `POST .../apply-verdict` also returns `verdict` and `applied_amount` (the clamped amount charged: positive fine, negative credit).

Known limits: the transcript and verdict files are keyed by incident id on the server disk, not per player; the in-process rate limit is per client IP.

---

## 3. Outcome Engine — Structured Scoring Contract

The complete, closed set of verdict values is:

| Verdict | Meaning | Permitted Adjustment Range | Backend Enforcement |
|---|---|---|---|
| `PENDING` | Interview in progress; non-final | Exactly \$0.00 | Ineligible for application |
| `VALID` | Operator actions fully compliant | $[-\$2,000.00, \$0.00]$ | Capped credit waiver |
| `JUSTIFIED` | Procedure deviated with acceptable justification | $[-\$2,000.00, \$0.00]$ | Capped credit waiver |
| `NON_COMPLIANT` | Defense rejected or contradicted ground truth | $[\$0.00, \text{Severity Ceiling}]$ | Clamped fine (\$750 – \$6,000) |

This four-value enum is the exhaustive, closed set: the integration *requests* one of these four strings (via `response_format: {"type": "json_object"}` and the schema in the system prompt, § 2.3) and **enforces** it server-side, because any other string is coerced to `PENDING` in `_invoke_auditor_llm`. The outcome therefore stays machine-actionable by `apply_interview_verdict` without string-matching heuristics on unconstrained model prose.

---

## 4. Non-Breaking Compliance Checklist

- [x] `GET /api/audits/postmortem/{incident_id}` and its `_render_template`/`_persist_report` internals (Document 05 §§ 3.2–3.5) do not depend on the interview; both draw on the shared `_build_incident_dossier`.
- [x] `_compile_interview_context` adds only a labelled `session_context` on top of the shared dossier; no second, independently maintained query exists.
- [x] Three interview endpoints (`POST .../interview`, read-only `GET .../interview`, `POST .../interview/apply-verdict`) sit beside `GET .../postmortem/{id}` and `GET .../export-pdf`; no existing route signature changed.
- [x] `Settings` carries three configuration fields (`LLM_API_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL_ID`), all actually read by the interview code.
- [x] Interview transcripts persist to a new sibling directory (`audits/interviews/`), never touching `audits/reports/`.
- [x] Two audit event types (`AI_AUDITOR_INTERVIEW_TURN`, `AI_AUDITOR_VERDICT_APPLIED`), both catalogued in the Audit Ledger Data Dictionary.
- [x] Fine adjustments are never auto-applied to a live session's budget without a distinct, explicit, separately-audited confirmation call — preserving the principle that only mechanically-derived penalties (Document 02's regulatory formulas) are applied unconditionally.
- [x] A missing key fails loudly (HTTP 503); an unreachable or malformed LLM response degrades to the neutral `PENDING` holding response rather than a fabricated verdict.
- [x] A chat UI consuming these endpoints is implemented in the post-mortem dialog (§ 2.7).
