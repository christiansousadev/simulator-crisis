from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, Numeric, String

from app.models.base import Base


class CareerRecord(Base):
    """PERMANENT HALL-OF-FAME ENTRY FOR ONE CONCLUDED RUN, NEVER WIPED BY A SESSION RESET"""

    __tablename__ = "career_records"

    id = Column(String(36), primary_key=True)
    player_id = Column(String(64), nullable=False, default="local-player")
    scenario_id = Column(String(50), nullable=True)
    outcome = Column(String(20), nullable=False)
    days_survived = Column(Integer, nullable=False)
    final_sla_percentage = Column(Numeric(5, 2), nullable=False)
    final_budget = Column(Numeric(12, 2), nullable=False)
    prestige_earned = Column(Integer, nullable=False, default=0)
    recorded_at = Column(DateTime, default=datetime.utcnow)
