from datetime import datetime
from sqlalchemy import Column, String, Numeric, Integer, DateTime
from sqlalchemy.orm import relationship
from app.models.base import Base

class GameSession(Base):
    """REPRESENTS AN ACTIVE OR CONCLUDED CRISIS MANAGEMENT SIMULATION RUN"""
    __tablename__ = "game_sessions"

    id = Column(String(36), primary_key=True)
    player_name = Column(String(100), nullable=False, default="VP of Infrastructure")
    budget = Column(Numeric(12, 2), nullable=False, default=250000.00)
    sla_percentage = Column(Numeric(5, 2), nullable=False, default=100.00)
    tech_debt = Column(Integer, nullable=False, default=25)
    user_happiness = Column(Numeric(5, 2), nullable=False, default=95.00)
    status = Column(String(20), nullable=False, default="running")
    current_tick = Column(Integer, nullable=False, default=0)
    prestige_points = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

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
