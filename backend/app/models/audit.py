from datetime import datetime
from sqlalchemy import Column, String, Integer, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.models.base import Base

class AuditLog(Base):
    """REPRESENTS AN IMMUTABLE COMPLIANCE AND GOVERNANCE AUDIT RECORD"""
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), ForeignKey("game_sessions.id", ondelete="CASCADE"), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    tick = Column(Integer, nullable=False)
    event_type = Column(String(50), nullable=False)
    actor = Column(String(50), nullable=False)
    details_json = Column(Text, nullable=False)
    compliance_flag = Column(Boolean, nullable=False, default=True)

    session = relationship("GameSession", back_populates="audit_logs")
