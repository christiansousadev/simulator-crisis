"""deterministic, rule-based stand-in for the LLM auditor persona.

Used when LLM_API_KEY is missing or the model API is unreachable, so the whole post-mortem flow
(interview -> verdict -> apply) works offline. It returns the exact same shape as the LLM path
(reply / verdict / regulatory_fine_adjustment); the amount is still only a recommendation that
formulas.eligible_audit_adjustment clamps before anything touches the budget."""

from typing import Any, Dict, List, Tuple

from app.engine import formulas

SLOW_ACK_TICKS = 6
SLOW_RESOLVE_TICKS = 24
FINE_PER_FINDING = 900.0
FINE_UNATTENDED_BREACH = 1500.0
CREDIT_CLEAN_RECORD = 1000.0
CREDIT_JUSTIFIED = 400.0
FINDINGS_PER_INTERVIEW = 2
# a defence needs some substance and at least one reasoned argument to count as justification
MIN_DEFENCE_CHARS = 40
JUSTIFICATION_KEYWORDS = (
    "because", "since", "due to", "evidence", "log", "runbook", "customer", "sla", "risk", "priority",
    "porque", "pois", "devido", "evidência", "evidencia", "cliente", "risco", "prioridade",
)


def _reply(text: str, verdict: str, adjustment: float) -> Dict[str, Any]:
    """AUDITOR TURN IN THE SAME SHAPE AS THE LLM PATH, LABELED SO NOBODY MISTAKES IT FOR A MODEL"""
    return {"reply": text, "verdict": verdict, "regulatory_fine_adjustment": adjustment, "source": "offline"}


def find_findings(context: Dict[str, Any]) -> List[Tuple[str, str, float]]:
    """(code, question, fine weight) for every governance concern in the dossier, worst first"""
    findings: List[Tuple[str, str, float]] = []
    mtta = context.get("mtta_ticks")
    if isinstance(mtta, (int, float)) and formulas.is_unattended_breach(int(mtta)):
        findings.append((
            "UNATTENDED",
            f"The alert sat unacknowledged for {int(mtta)} ticks, past the {formulas.UNATTENDED_BREACH_TICK}-tick "
            "regulatory limit. Who was on call, and why did nobody acknowledge it?",
            FINE_UNATTENDED_BREACH,
        ))
    elif isinstance(mtta, (int, float)) and mtta > SLOW_ACK_TICKS:
        findings.append((
            "SLOW_ACK",
            f"MTTA was {int(mtta)} ticks, above the {SLOW_ACK_TICKS}-tick expectation. "
            "Was the monitoring or the on-call rotation negligent here?",
            FINE_PER_FINDING,
        ))

    mitigations = context.get("mitigations") or []
    if not context.get("root_cause_confirmed") and mitigations:
        findings.append((
            "NO_TRIAGE",
            "You ran a runbook without confirming the root cause through log triage. "
            "On what evidence did you choose that action?",
            FINE_PER_FINDING,
        ))
    mismatches = [m for m in mitigations if not m.get("fully_resolved")]
    if mismatches:
        names = ", ".join(sorted({str(m.get("action")) for m in mismatches}))
        findings.append((
            "MISMATCH",
            f"{names} did not fully resolve the incident, which left the service degraded and added technical debt. "
            "Why was this the right tool for this root cause?",
            FINE_PER_FINDING,
        ))
    if any(m.get("action") == "Hotfix Prod Live" for m in mitigations):
        findings.append((
            "HOTFIX",
            "You pushed 'Hotfix Prod Live' directly to production. That deliberately trades technical debt "
            "for speed; was a safer runbook really unavailable?",
            FINE_PER_FINDING,
        ))
    mttr = context.get("mttr_ticks")
    if isinstance(mttr, (int, float)) and mttr > SLOW_RESOLVE_TICKS:
        findings.append((
            "SLOW_RESOLVE",
            f"Resolution took {int(mttr)} ticks. What slowed recovery, and what would you change next time?",
            FINE_PER_FINDING,
        ))
    delta = context.get("tech_debt_delta")
    if isinstance(delta, (int, float)) and delta >= 8 and not any(f[0] == "HOTFIX" for f in findings):
        findings.append((
            "DEBT",
            f"Technical debt rose by {int(delta)} points across this incident. Was that increase deliberate?",
            FINE_PER_FINDING,
        ))
    return findings


def _is_defended(message: str) -> bool:
    text = message.strip().lower()
    return len(text) >= MIN_DEFENCE_CHARS and any(k in text for k in JUSTIFICATION_KEYWORDS)


def respond(context: Dict[str, Any], transcript: List[Dict[str, str]]) -> Dict[str, Any]:
    """ONE AUDITOR TURN. transcript ENDS WITH THE PLAYER'S LATEST MESSAGE."""
    player_turns = [t["content"] for t in transcript if t.get("role") == "player"]
    turn = len(player_turns)
    findings = find_findings(context)
    asked = findings[:FINDINGS_PER_INTERVIEW]

    # still interviewing: one question per turn, then the closing turn issues the verdict
    if turn <= len(asked):
        return _reply(asked[turn - 1][1], "PENDING", 0.0)

    if not findings:
        return _reply(
            "The record shows prompt acknowledgement, a matched runbook and no unexplained debt. "
            "No compliance concerns. Verdict: VALID.",
            "VALID",
            -CREDIT_CLEAN_RECORD,
        )

    answers = player_turns[: len(asked)] or player_turns[-1:]
    defended = sum(1 for a in answers if _is_defended(a))
    if defended == len(answers):
        return _reply(
            "Your reasoning is documented and consistent with the dossier. "
            "The decisions are justified despite the findings. Verdict: JUSTIFIED.",
            "JUSTIFIED",
            -CREDIT_JUSTIFIED,
        )

    fine = sum(f[2] for f in findings) * (1.0 if defended == 0 else 0.5)
    return _reply(
        f"I found {len(findings)} unresolved governance concern(s) and your answers did not "
        "substantiate them. Verdict: NON_COMPLIANT.",
        "NON_COMPLIANT",
        float(fine),
    )
