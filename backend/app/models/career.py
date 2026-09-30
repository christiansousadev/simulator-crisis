from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, Numeric, String, Text

from app.models.base import Base


class CareerRecord(Base):
    """PERMANENT HALL-OF-FAME ENTRY FOR ONE CONCLUDED RUN, NEVER WIPED BY A SESSION RESET"""

    __tablename__ = "career_records"

    id = Column(String(36), primary_key=True)
    player_id = Column(String(64), nullable=False, default="local-player")
    scenario_id = Column(String(50), nullable=True)
    difficulty = Column(String(20), nullable=True, default="standard")
    outcome = Column(String(20), nullable=False)
    days_survived = Column(Integer, nullable=False)
    final_sla_percentage = Column(Numeric(5, 2), nullable=False)
    final_budget = Column(Numeric(12, 2), nullable=False)
    prestige_earned = Column(Integer, nullable=False, default=0)
    recorded_at = Column(DateTime, default=datetime.utcnow)
    # true when this run was, at any point, resumed from a persisted snapshot after a backend
    # restart rather than played start-to-finish in one continuous process -- not used to exclude
    # the record from any ranking today, just kept so that decision can be made later without the
    # information having already been lost
    recovered_from_snapshot = Column(Boolean, nullable=False, default=False)
    # consolidated final-state fields, all nullable since a record persisted before this column
    # existed genuinely has no historical value to backfill -- never fabricated
    final_tech_debt = Column(Integer, nullable=True)
    final_reputation = Column(Numeric(5, 2), nullable=True)
    # derived by counting persisted incident rows for this run's session_id at conclusion time
    # (the same "count from what's actually persisted, never a separately-tracked counter that
    # could drift" philosophy the engine already uses to reconstruct resolved-incident progress
    # on a restore), not from an in-memory counter
    incidents_total = Column(Integer, nullable=True)
    incidents_resolved = Column(Integer, nullable=True)
    # the scripted/custom scenario's own raw evaluate_victory() payload, preserving fields
    # specific to that scenario (e.g. ransomware's master_db_encrypted/services_contained) that
    # the flat scalar columns above can't express; null when no scenario was active
    scenario_outcome_json = Column(Text, nullable=True)
    # this scenario's own objectives() checklist, snapshotted at the moment of conclusion; null
    # when no scenario was active or it defines no objectives
    objectives_json = Column(Text, nullable=True)
