"""stakeholder pressure and public status-page rules for open incidents.

pure, deterministic functions (no rng, no engine state): the simulator owns the feed list and the
audit/financial side effects, this module only decides *which* message is due and *whether* a posted
status update is truthful. message text lives in the frontend's locale files, keyed by `kind`.
"""

from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

# ordered stages a status-page post can announce; a later stage supersedes an earlier one
STATUS_STAGES: Tuple[str, ...] = ("investigating", "identified", "mitigating")

# kind -> (sender, minimum incident age in ticks, severities that trigger it)
STAKEHOLDER_SCHEDULE: Tuple[Tuple[str, str, int, Tuple[str, ...]], ...] = (
    ("ceo_inquiry", "CEO", 1, ("P1_CRITICAL", "P2_HIGH")),
    ("support_surge", "SUPPORT", 3, ("P1_CRITICAL", "P2_HIGH")),
    ("legal_sla", "LEGAL", 6, ("P1_CRITICAL",)),
    ("board_pressure", "BOARD", 10, ("P1_CRITICAL",)),
)

STAKEHOLDER_FEED_LIMIT = 30

# customer sentiment: a published, truthful update soothes; silence on a serious incident stings
STATUS_UPDATE_HAPPINESS_BONUS = 2.0
STATUS_LIE_REPUTATION_PENALTY = 3.0
SILENCE_GRACE_TICKS = 3
SILENCE_DECAY_MULTIPLIER = 1.5
COMMUNICATED_DECAY_MULTIPLIER = 0.6
# only incidents of these severities are visible enough for the public to expect a status post
STATUS_PAGE_SEVERITIES = ("P1_CRITICAL", "P2_HIGH")


def stage_rank(stage: Optional[str]) -> int:
    """1-BASED POSITION OF A STAGE IN STATUS_STAGES (0 FOR None/UNKNOWN)"""
    return STATUS_STAGES.index(stage) + 1 if stage in STATUS_STAGES else 0


def is_truthful(stage: str, incident: Dict[str, Any]) -> bool:
    """WHETHER ANNOUNCING stage MATCHES WHAT THE INCIDENT RECORD ACTUALLY SHOWS: 'identified'
    NEEDS A CONFIRMED ROOT CAUSE, 'mitigating' NEEDS AN ENGINEER TO HAVE ACKNOWLEDGED IT"""
    if stage == "investigating":
        return True
    if stage == "identified":
        return bool(incident.get("triage_solved"))
    if stage == "mitigating":
        return incident.get("status") == "acknowledged"
    return False


def due_stakeholder_messages(
    incident: Dict[str, Any], current_tick: int, already_sent: Iterable[Tuple[str, str]]
) -> List[Dict[str, Any]]:
    """MESSAGES NEWLY DUE FOR ONE OPEN INCIDENT, GIVEN THE (incident_id, kind) PAIRS ALREADY SENT"""
    sent: Set[Tuple[str, str]] = set(already_sent)
    age = current_tick - incident["created_tick"]
    due: List[Dict[str, Any]] = []
    for kind, sender, min_age, severities in STAKEHOLDER_SCHEDULE:
        if incident["severity"] in severities and age >= min_age and (incident["id"], kind) not in sent:
            due.append({"kind": kind, "sender": sender})
    return due


def communication_decay_multiplier(open_incidents: Iterable[Dict[str, Any]], current_tick: int) -> float:
    """MULTIPLIER ON THE PER-TICK HAPPINESS DECAY: >1 WHILE A SERIOUS INCIDENT HAS GONE UNANNOUNCED
    PAST THE GRACE WINDOW, <1 WHILE EVERY SERIOUS OPEN INCIDENT HAS A PUBLISHED UPDATE, ELSE 1"""
    serious = [i for i in open_incidents if i["severity"] in STATUS_PAGE_SEVERITIES]
    if not serious:
        return 1.0
    if any(
        not i.get("status_page_rank") and current_tick - i["created_tick"] > SILENCE_GRACE_TICKS for i in serious
    ):
        return SILENCE_DECAY_MULTIPLIER
    if all(i.get("status_page_rank") for i in serious):
        return COMMUNICATED_DECAY_MULTIPLIER
    return 1.0
