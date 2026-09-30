from sqlalchemy import Boolean, Column, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import relationship

from app.models.base import Base


class Incident(Base):
    """REPRESENTS AN ACTIVE OR RESOLVED CRISIS INCIDENT"""
    __tablename__ = "incidents"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), ForeignKey("game_sessions.id", ondelete="CASCADE"), nullable=False)
    service_id = Column(String(36), ForeignKey("services.id", ondelete="CASCADE"), nullable=False)
    severity = Column(String(20), nullable=False)
    title = Column(String(255), nullable=False)
    root_cause = Column(Text, nullable=False)
    mtta_seconds = Column(Integer, nullable=False, default=0)
    mttr_seconds = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False, default="active")
    created_tick = Column(Integer, nullable=False)
    acknowledged_tick = Column(Integer, nullable=True)
    resolved_tick = Column(Integer, nullable=True)
    triage_solved = Column(Boolean, nullable=False, default=False)
    # the synthetic log stream generated once at incident creation (list of {id, tick_offset,
    # level, message}) and its answer key -- persisted so a restart can resume the triage
    # mini-game with the exact same evidence the player was already looking at, instead of
    # discarding the incident (and its investigation progress) entirely
    log_lines_json = Column(Text, nullable=True)
    root_cause_line_id = Column(String(20), nullable=True)
    triage_wrong_attempts = Column(Integer, nullable=False, default=0)
    triage_accuracy = Column(Numeric(4, 3), nullable=True)
    # immutable point-in-time facts, captured once and never reconstructed from the session's
    # *current* state -- the postmortem/AI-auditor pipeline reads these instead of session.tech_debt
    # so a report generated long after the incident closed still reflects what was true when it
    # actually happened (see backend/app/api/v1/audits.py's _build_incident_dossier)
    tech_debt_at_creation = Column(Integer, nullable=True)
    tech_debt_at_resolution = Column(Integer, nullable=True)
    accrued_surcharge = Column(Numeric(12, 2), nullable=False, default=0)

    session = relationship("GameSession", back_populates="incidents")
    service = relationship("Service", back_populates="incidents")
