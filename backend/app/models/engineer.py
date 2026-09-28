from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.models.base import Base


class Engineer(Base):
    """REPRESENTS AN INDIVIDUAL ON-CALL ENGINEER WITH STRESS AND STAMINA STATE"""

    __tablename__ = "engineers"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), ForeignKey("game_sessions.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    assigned_service_id = Column(String(36), ForeignKey("services.id", ondelete="SET NULL"), nullable=True)
    core_competency = Column(String(20), nullable=False)
    stress_level = Column(Integer, nullable=False, default=0)
    stamina = Column(Integer, nullable=False, default=100)
    on_call_status = Column(String(20), nullable=False, default="on_duty")
    hired_at_tick = Column(Integer, nullable=False)

    session = relationship("GameSession", back_populates="engineers")
