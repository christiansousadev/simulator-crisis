import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query

from app.core.database import SessionLocal
from app.engine.achievements import ACHIEVEMENT_CATALOG
from app.models.achievement import Achievement
from app.models.career import CareerRecord

router = APIRouter(tags=["career"])


def _serialize_record(r: CareerRecord) -> Dict[str, Any]:
    return {
        "id": r.id,
        "player_id": r.player_id,
        "scenario_id": r.scenario_id,
        "difficulty": getattr(r, "difficulty", "standard") or "standard",
        "outcome": r.outcome,
        "days_survived": r.days_survived,
        "final_sla_percentage": float(r.final_sla_percentage),
        "final_budget": float(r.final_budget),
        "final_tech_debt": r.final_tech_debt,
        "final_reputation": float(r.final_reputation) if r.final_reputation is not None else None,
        "incidents_total": r.incidents_total,
        "incidents_resolved": r.incidents_resolved,
        "prestige_earned": r.prestige_earned,
        "recorded_at": r.recorded_at.isoformat() if r.recorded_at else None,
        "scenario_outcome": json.loads(r.scenario_outcome_json) if r.scenario_outcome_json else None,
        "objectives": json.loads(r.objectives_json) if r.objectives_json else None,
    }


def _calculate_operator_rank(prestige: int, achievements_count: int) -> tuple[str, str]:
    if prestige >= 500 or achievements_count >= 10:
        return "VP of Reliability & Governance", "vp_reliability"
    if prestige >= 300 or achievements_count >= 7:
        return "Principal Infrastructure Architect", "principal_architect"
    if prestige >= 150 or achievements_count >= 4:
        return "Senior Chaos Operator", "senior_operator"
    if prestige >= 50 or achievements_count >= 2:
        return "Site Reliability Engineer", "sre"
    return "Junior On-Call Engineer", "junior_oncall"


def _derive_next_challenge(
    records: List[CareerRecord], unlocked_achievement_ids: set
) -> Dict[str, Any]:
    won_scenarios = {
        r.scenario_id for r in records if r.outcome == "victory"
    }

    if not records:
        return {
            "type": "first_run",
            "challenge_key": "first_run",
            "scenario_id": None,
            "difficulty": "intern",
            "title": "First Operational Shift",
            "description": "Launch your first Sandbox run on Intern difficulty to learn real-time incident triage and SLA defense.",
            "target_achievement": "first_response",
            "target_achievement_name": "First Response",
        }

    # If sandbox not beaten yet
    if None not in won_scenarios and "sandbox" not in won_scenarios:
        return {
            "type": "scenario",
            "challenge_key": "sandbox_cycle",
            "scenario_id": None,
            "difficulty": "standard",
            "title": "Monthly Audit Defense",
            "description": "Survive a full operational cycle in Sandbox mode on Standard difficulty without breaching the SLA error budget.",
            "target_achievement": "century_club",
            "target_achievement_name": "Century Club",
        }

    # If Black Friday rush not beaten
    if "black_friday_rush" not in won_scenarios:
        return {
            "type": "scenario",
            "challenge_key": "black_friday_rush",
            "scenario_id": "black_friday_rush",
            "difficulty": "standard",
            "title": "Black Friday Traffic Surge",
            "description": "Sustain 4.0x traffic and accelerated operational cloud burn during Black Friday Rush.",
            "target_achievement": "budget_master",
            "target_achievement_name": "Budget Master",
        }

    # If Chaos Engineering drill not beaten
    if "chaos_engineering_drill" not in won_scenarios:
        return {
            "type": "scenario",
            "challenge_key": "chaos_drill",
            "scenario_id": "chaos_engineering_drill",
            "difficulty": "standard",
            "title": "Chaos Engineering Drill",
            "description": "Survive 40 ticks of random pod terminations with zero regulatory compliance breach flags.",
            "target_achievement": "chaos_survivor",
            "target_achievement_name": "Chaos Survivor",
        }

    # If Ransomware infiltration not beaten
    if "ransomware_infiltration" not in won_scenarios:
        return {
            "type": "scenario",
            "challenge_key": "ransomware_containment",
            "scenario_id": "ransomware_infiltration",
            "difficulty": "standard",
            "title": "Ransomware Containment",
            "description": "Quarantine lateral infection movement before the critical payment database is encrypted.",
            "target_achievement": "ransomware_repelled",
            "target_achievement_name": "Ransomware Repelled",
        }

    # If all scenarios beaten, suggest Chaos difficulty
    chaos_victories = [
        r for r in records if r.outcome == "victory" and getattr(r, "difficulty", "standard") == "chaos"
    ]
    if not chaos_victories:
        return {
            "type": "difficulty",
            "challenge_key": "chaos_mastery",
            "scenario_id": "chaos_engineering_drill",
            "difficulty": "chaos",
            "title": "Chaos Difficulty Mastery",
            "description": "Step up to Chaos difficulty (+40% incident hazard multiplier, tighter starting runway).",
            "target_achievement": "debt_free",
            "target_achievement_name": "Debt Free",
        }

    # Recommend pending achievement
    pending_achievements = [a for a in ACHIEVEMENT_CATALOG if a["id"] not in unlocked_achievement_ids]
    if pending_achievements:
        target = pending_achievements[0]
        return {
            "type": "achievement",
            "challenge_key": "pursue_achievement",
            "scenario_id": None,
            "difficulty": "standard",
            "title": f"Pursue: {target['name']}",
            "description": target["description"],
            "target_achievement": target["id"],
            "target_achievement_name": target["name"],
        }

    return {
        "type": "mastery",
        "challenge_key": "sre_grandmaster",
        "scenario_id": "ransomware_infiltration",
        "difficulty": "chaos",
        "title": "SRE Grandmaster",
        "description": "Defend high-stakes production environments against zero-day ransomware under extreme Chaos parameters.",
        "target_achievement": "zero_downtime_week",
        "target_achievement_name": "Zero Downtime Week",
    }


@router.get("/api/career/records")
async def list_career_records(
    player_id: Optional[str] = Query(default=None, max_length=64, pattern=r"^[A-Za-z0-9_-]+$"),
    scope: str = Query(default="mine"),
    order_by: str = Query(default="recorded_at"),
    scenario_id: Optional[str] = Query(default=None),
    difficulty: Optional[str] = Query(default=None),
) -> List[Dict[str, Any]]:
    """LIST HALL-OF-FAME RUNS, EITHER FOR ONE PLAYER OR ACROSS EVERYONE ON THIS SERVER"""
    db = SessionLocal()
    try:
        query = db.query(CareerRecord)
        if scope == "mine" and player_id:
            query = query.filter(CareerRecord.player_id == player_id)
        if scenario_id:
            if scenario_id == "sandbox":
                query = query.filter(CareerRecord.scenario_id.is_(None))
            else:
                query = query.filter(CareerRecord.scenario_id == scenario_id)
        if difficulty:
            query = query.filter(CareerRecord.difficulty == difficulty)

        if order_by == "recorded_at":
            query = query.order_by(CareerRecord.recorded_at.desc())
        elif order_by == "sla":
            query = query.order_by(CareerRecord.final_sla_percentage.desc(), CareerRecord.days_survived.desc())
        else:
            query = query.order_by(CareerRecord.days_survived.desc(), CareerRecord.final_sla_percentage.desc())

        records = query.limit(50).all()
        return [_serialize_record(r) for r in records]
    finally:
        db.close()


@router.get("/api/career/summary")
async def get_career_summary(
    player_id: Optional[str] = Query(default=None, max_length=64, pattern=r"^[A-Za-z0-9_-]+$"),
) -> Dict[str, Any]:
    """RETRIEVE CONSOLIDATED CAREER PROGRESSION, BEST HISTORICAL RUNS AND NEXT CHALLENGE"""
    db = SessionLocal()
    try:
        query = db.query(CareerRecord)
        if player_id:
            query = query.filter(CareerRecord.player_id == player_id)
        all_records = query.all()

        achievements_query = db.query(Achievement)
        if player_id:
            achievements_query = achievements_query.filter(Achievement.player_id == player_id)
        unlocked_achievements = achievements_query.all()
        unlocked_ids = {a.achievement_key for a in unlocked_achievements}

        lifetime_prestige = sum(
            a["prestige_points"] for a in ACHIEVEMENT_CATALOG if a["id"] in unlocked_ids
        )

        total_runs = len(all_records)
        victories = sum(1 for r in all_records if r.outcome == "victory")
        bankruptcies = sum(1 for r in all_records if r.outcome == "bankrupted")
        defeats = sum(1 for r in all_records if r.outcome == "scenario_defeat")
        total_incidents_resolved = sum(r.incidents_resolved or 0 for r in all_records)

        # compute best runs per scenario
        best_runs: Dict[str, Optional[Dict[str, Any]]] = {
            "sandbox": None,
            "black_friday_rush": None,
            "chaos_engineering_drill": None,
            "ransomware_infiltration": None,
        }

        def record_score(rec: CareerRecord) -> float:
            score = 0.0
            if rec.outcome == "victory":
                score += 10000.0
            diff = getattr(rec, "difficulty", "standard") or "standard"
            if diff == "chaos":
                score += 2000.0
            elif diff == "standard":
                score += 1000.0
            score += rec.days_survived * 50.0
            score += float(rec.final_sla_percentage) * 10.0
            score += float(rec.final_budget) / 10000.0
            return score

        for sc_key in best_runs.keys():
            matching = [
                r for r in all_records
                if (sc_key == "sandbox" and r.scenario_id is None) or (r.scenario_id == sc_key)
            ]
            if matching:
                best = max(matching, key=record_score)
                best_runs[sc_key] = _serialize_record(best)

        rank, rank_key = _calculate_operator_rank(lifetime_prestige, len(unlocked_ids))
        next_challenge = _derive_next_challenge(all_records, unlocked_ids)

        return {
            "total_runs": total_runs,
            "victories": victories,
            "bankruptcies": bankruptcies,
            "defeats": defeats,
            "total_incidents_resolved": total_incidents_resolved,
            "lifetime_prestige": lifetime_prestige,
            "operator_rank": rank,
            "operator_rank_key": rank_key,
            "best_runs": best_runs,
            "recommended_challenge": next_challenge,
        }
    finally:
        db.close()
