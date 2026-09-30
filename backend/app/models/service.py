from sqlalchemy import Column, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import relationship

from app.models.base import Base


class Service(Base):
    """REPRESENTS A MONITORED MICROSERVICE WITHIN THE TOPOLOGY MESH"""
    __tablename__ = "services"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), ForeignKey("game_sessions.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    tier = Column(String(20), nullable=False)
    status = Column(String(20), nullable=False, default="healthy")
    latency_ms = Column(Integer, nullable=False, default=45)
    error_rate = Column(Numeric(5, 4), nullable=False, default=0.0000)
    # a JSON array of other service ids THIS service depends on (upstream prerequisites) -- see
    # app.engine.simulator.SimulationEngine._init_default_services's docstring for the full
    # direction convention every mechanic that walks this graph must follow
    dependencies_json = Column(Text, nullable=False, default="[]")

    session = relationship("GameSession", back_populates="services")
    incidents = relationship("Incident", back_populates="service", cascade="all, delete-orphan")
