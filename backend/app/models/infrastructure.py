from sqlalchemy import Column, String, Numeric, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.models.base import Base


class InfrastructureNode(Base):
    """REPRESENTS A PLAYER-PLACED HARDWARE MODULE IN THE SERVER ROOM BUILD-MODE GRID"""

    __tablename__ = "infrastructure_nodes"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), ForeignKey("game_sessions.id", ondelete="CASCADE"), nullable=False)
    node_type = Column(String(30), nullable=False)
    grid_x = Column(Numeric(6, 2), nullable=False)
    grid_y = Column(Numeric(6, 2), nullable=False)
    status = Column(String(20), nullable=False, default="active")
    config_json = Column(Text, nullable=False)

    session = relationship("GameSession", back_populates="infrastructure_nodes")
