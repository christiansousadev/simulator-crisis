from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, Numeric, String, Text
from sqlalchemy.orm import relationship

from app.models.base import Base

# bump whenever a restore-relevant field is added/reshaped so an old row can be told apart from
# a row this exact code version can safely interpret -- see SimulationEngine's
# CURRENT_SCHEMA_VERSION and _try_restore_from_snapshot's version check
CURRENT_SCHEMA_VERSION = 1


class GameSession(Base):
    """REPRESENTS AN ACTIVE OR CONCLUDED CRISIS MANAGEMENT SIMULATION RUN"""
    __tablename__ = "game_sessions"

    # these column defaults are a last-resort db-level fallback only -- every actual game start
    # (SimulationEngine._persist_bootstrap) always writes explicit values derived from the chosen
    # difficulty preset / current engine state, so in practice these are never relied upon; kept
    # aligned with SimulationEngine's own standard-difficulty starting values so the two never
    # silently drift apart if a future code path ever does insert a bare row
    id = Column(String(36), primary_key=True)
    player_name = Column(String(100), nullable=False, default="VP of Infrastructure")
    budget = Column(Numeric(12, 2), nullable=False, default=250000.00)
    sla_percentage = Column(Numeric(5, 2), nullable=False, default=100.00)
    tech_debt = Column(Integer, nullable=False, default=25)
    user_happiness = Column(Numeric(5, 2), nullable=False, default=96.00)
    status = Column(String(20), nullable=False, default="running")
    current_tick = Column(Integer, nullable=False, default=0)
    prestige_points = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # --- restore-relevant fields added for full session resilience ---
    # snapshot format version: lets a restart tell an old/incompatible row apart from one this
    # exact code version wrote, instead of silently misreading fields that changed shape
    schema_version = Column(Integer, nullable=False, default=CURRENT_SCHEMA_VERSION)
    difficulty = Column(String(20), nullable=False, default="standard")
    reputation = Column(Numeric(5, 2), nullable=False, default=50.00)
    # None = sandbox (no scripted scenario active)
    scenario_id = Column(String(50), nullable=True)
    # {"elapsed_ticks": int, "completed": bool, "outcome": dict|None, "extra": dict} -- see
    # ScenarioEngine.snapshot_extra()/restore_extra()
    scenario_state_json = Column(Text, nullable=True)
    # serialized {action_id: last_fired_tick}, mirrors SimulationEngine.mitigation_last_fired_tick
    mitigation_cooldowns_json = Column(Text, nullable=True)
    # serialized list of temporary decision-caused hazard windows (corner-cutting dilemma choices)
    temporary_hazard_effects_json = Column(Text, nullable=True)
    quiet_ticks = Column(Integer, nullable=False, default=0)
    # random.getstate(), serialized, so a restored run continues the same rng sequence instead of
    # producing a completely different one out of the player's control
    random_state_json = Column(Text, nullable=True)
    # the rolling SLA sample window (up to 720 per-tick instant_sla_percentage values) and the
    # short error-budget burn-rate history (up to 10 burn-ratio samples), serialized in full --
    # without these, a restart could only reseed a single averaged value, which produces a
    # different next-tick calculation than an uninterrupted process would as soon as an old
    # sample would have aged out of the window. sla_percentage/error_budget_remaining_ratio
    # remain the only derived scalars; these two columns are the one source the window itself is
    # ever read from or written to.
    sla_window_json = Column(Text, nullable=True)
    error_budget_history_json = Column(Text, nullable=True)

    # one-to-many relationships
    services = relationship("Service", back_populates="session", cascade="all, delete-orphan")
    incidents = relationship("Incident", back_populates="session", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="session", cascade="all, delete-orphan")
    purchased_upgrades = relationship("PurchasedUpgrade", back_populates="session", cascade="all, delete-orphan")
    dilemma_events = relationship("DilemmaEvent", back_populates="session", cascade="all, delete-orphan")
    engineers = relationship("Engineer", back_populates="session", cascade="all, delete-orphan")
    infrastructure_nodes = relationship("InfrastructureNode", back_populates="session", cascade="all, delete-orphan")
    # no delete-orphan cascade here: achievements and cosmetics are permanent career records that
    # must survive a session reset. passive_deletes stops the orm from loading these collections
    # and nulling their (non-nullable) session_id on parent delete; sqlite ignores the fk's
    # ondelete hint since foreign_keys pragma is off, so the rows are simply left intact.
    achievements = relationship("Achievement", back_populates="session", passive_deletes=True)
    unlocked_cosmetics = relationship("UnlockedCosmetic", back_populates="session", passive_deletes=True)
