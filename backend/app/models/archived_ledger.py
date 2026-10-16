from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String, Text

from app.models.base import Base


class ArchivedAuditLedger(Base):
    """SUMMARY OF A PURGED SESSION'S GOVERNANCE LEDGER, KEPT WHEN A SESSION RESET CASCADE-DELETES
    ITS audit_logs ROWS -- DELIBERATELY NOT FK-LINKED TO game_sessions SO THE PURGE CANNOT TAKE IT"""
    __tablename__ = "archived_audit_ledgers"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), nullable=False, index=True)
    archived_at = Column(DateTime, default=datetime.utcnow)
    final_tick = Column(Integer, nullable=False)
    final_status = Column(String(20), nullable=False)
    final_budget = Column(Float, nullable=False)
    event_count = Column(Integer, nullable=False)
    incident_count = Column(Integer, nullable=False)
    ledger_checksum = Column(String(64), nullable=False)
    summary_json = Column(Text, nullable=False)
