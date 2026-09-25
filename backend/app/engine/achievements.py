"""achievement catalog and unlock predicates for the career progression system"""

from typing import Any, Callable, Dict, List

ACHIEVEMENT_CATALOG: List[Dict[str, Any]] = [
    {"id": "zero_trust_architect", "name": "Zero Trust Architect", "description": "Purchase the Multi-AZ Compute Clusters upgrade.", "prestige_points": 50},
    {"id": "chaos_survivor", "name": "Chaos Survivor", "description": "Complete the Chaos Engineering Drill with zero regulatory breach flags.", "prestige_points": 75},
    {"id": "soc2_type_ii_certified", "name": "SOC-2 Type II Certified", "description": "Survive a full monthly SLA audit cycle.", "prestige_points": 150},
    {"id": "budget_master", "name": "Budget Master", "description": "Reach tick 200 with at least $200,000 in runway.", "prestige_points": 60},
    {"id": "night_shift_hero", "name": "Night Shift Hero", "description": "Acknowledge an incident during the night shift.", "prestige_points": 40},
    {"id": "zero_downtime_week", "name": "Zero Downtime Week", "description": "Sustain 168 consecutive ticks with no active incident.", "prestige_points": 80},
    {"id": "debt_free", "name": "Debt Free", "description": "Reduce Technical Debt Index to zero.", "prestige_points": 45},
    {"id": "first_response", "name": "First Response", "description": "Acknowledge an incident within 1 tick of it being raised.", "prestige_points": 30},
    {"id": "ransomware_repelled", "name": "Ransomware Repelled", "description": "Repel the Ransomware Infiltration scenario.", "prestige_points": 100},
    {"id": "full_roster", "name": "Full Roster", "description": "Hire 3 or more on-call engineers.", "prestige_points": 35},
    {"id": "century_club", "name": "Century Club", "description": "Survive to tick 100.", "prestige_points": 20},
    {"id": "emergency_room", "name": "Emergency Room", "description": "Resolve 10 or more incidents in a single session.", "prestige_points": 55},
]


def _zero_trust_architect(engine: Any) -> bool:
    return "multi_az_clusters" in engine.purchased_upgrade_ids


def _chaos_survivor(engine: Any) -> bool:
    scenario = engine.active_scenario
    return bool(scenario and scenario.scenario_id == "chaos_engineering_drill" and scenario.completed and scenario.outcome and scenario.outcome.get("compliant"))


def _soc2_type_ii_certified(engine: Any) -> bool:
    return engine.status == "victory"


def _budget_master(engine: Any) -> bool:
    return engine.current_tick >= 200 and engine.budget >= 200000.0


def _night_shift_hero(engine: Any) -> bool:
    return getattr(engine, "_night_shift_ack_seen", False)


def _zero_downtime_week(engine: Any) -> bool:
    return engine.quiet_ticks >= 168


def _debt_free(engine: Any) -> bool:
    return engine.tech_debt == 0


def _first_response(engine: Any) -> bool:
    return getattr(engine, "_first_response_seen", False)


def _ransomware_repelled(engine: Any) -> bool:
    scenario = engine.active_scenario
    return bool(scenario and scenario.scenario_id == "ransomware_infiltration" and scenario.completed and scenario.outcome and scenario.outcome.get("compliant"))


def _full_roster(engine: Any) -> bool:
    return len(engine.engineers) >= 3


def _century_club(engine: Any) -> bool:
    return engine.current_tick >= 100


def _emergency_room(engine: Any) -> bool:
    return engine._resolved_incident_count >= 10


ACHIEVEMENT_CHECKS: Dict[str, Callable[[Any], bool]] = {
    "zero_trust_architect": _zero_trust_architect,
    "chaos_survivor": _chaos_survivor,
    "soc2_type_ii_certified": _soc2_type_ii_certified,
    "budget_master": _budget_master,
    "night_shift_hero": _night_shift_hero,
    "zero_downtime_week": _zero_downtime_week,
    "debt_free": _debt_free,
    "first_response": _first_response,
    "ransomware_repelled": _ransomware_repelled,
    "full_roster": _full_roster,
    "century_club": _century_club,
    "emergency_room": _emergency_room,
}


def find_achievement(achievement_id: str) -> Dict[str, Any] | None:
    """LOOK UP AN ACHIEVEMENT CATALOG DEFINITION BY ITS ID"""
    return next((a for a in ACHIEVEMENT_CATALOG if a["id"] == achievement_id), None)
