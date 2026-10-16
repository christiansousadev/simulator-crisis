"""the AI auditor interview endpoints: read-only transcript GET, clamped previews, apply-once"""

import json
import os
import tempfile
import uuid

import pytest

# same isolated sqlite file as the smoke tests; set before app.core.database is first imported
os.environ.setdefault("DATABASE_URL", f"sqlite:///{os.path.join(tempfile.gettempdir(), 'incidentzero_pytest.db')}")

from fastapi import HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.api.v1 import audits  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models.incident import Incident  # noqa: E402
from app.models.service import Service  # noqa: E402


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def interviews_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(audits, "INTERVIEWS_DIR", tmp_path)
    return tmp_path


@pytest.fixture()
def incident_id(client):
    """a persisted incident that belongs to the live session"""
    client.post("/api/session/reset")
    client.post("/api/session/pause")
    iid = f"inc-{uuid.uuid4().hex[:6]}"
    db = SessionLocal()
    try:
        service = db.query(Service).first()
        db.add(
            Incident(
                id=iid,
                session_id=app.state.engine.session_id,
                service_id=service.id,
                severity="P2_HIGH",
                title="Auditor test incident",
                root_cause="bad deploy",
                created_tick=1,
                status="resolved",
                resolved_tick=5,
            )
        )
        db.commit()
    finally:
        db.close()
    yield iid
    db = SessionLocal()
    try:
        db.query(Incident).filter(Incident.id == iid).delete()
        db.commit()
    finally:
        db.close()


def _write_interview(directory, iid, verdict="NON_COMPLIANT", proposed=99999.0, applied=False):
    (directory / f"{iid}.json").write_text(
        json.dumps([{"role": "player", "content": "I rolled back"}, {"role": "auditor", "content": "Why so late?"}]),
        encoding="utf-8",
    )
    (directory / f"{iid}.verdict.json").write_text(
        json.dumps({"verdict": verdict, "proposed_amount": proposed, "applied": applied}), encoding="utf-8"
    )


def test_get_interview_404_for_unknown_incident(client, interviews_dir):
    resp = client.get("/api/audits/postmortem/inc-nope00/interview")
    assert resp.status_code == 404


@pytest.mark.parametrize("bad_id", ["a.b", "a b", "..", "x" * 65, "inc-1;rm"])
def test_get_interview_rejects_malformed_ids_without_touching_disk(client, interviews_dir, bad_id):
    (interviews_dir / "secret.json").write_text("[]", encoding="utf-8")
    resp = client.get(f"/api/audits/postmortem/{bad_id}/interview")
    assert resp.status_code == 404


def test_get_interview_404_when_no_transcript_yet(client, interviews_dir, incident_id):
    assert client.get(f"/api/audits/postmortem/{incident_id}/interview").status_code == 404


def test_get_interview_returns_turns_and_clamped_verdict(client, interviews_dir, incident_id):
    _write_interview(interviews_dir, incident_id)
    resp = client.get(f"/api/audits/postmortem/{incident_id}/interview")
    assert resp.status_code == 200
    body = resp.json()
    assert [t["role"] for t in body["turns"]] == ["player", "auditor"]
    assert body["verdict"] == "NON_COMPLIANT"
    # P2_HIGH ceiling, never the raw 99999 proposal
    assert body["regulatory_fine_adjustment"] == 3000.0
    assert body["adjustment_cap"] == 3000.0
    assert body["applied"] is False
    assert body["transcript_turn"] == 1


def test_get_interview_survives_a_corrupt_verdict_cache(client, interviews_dir, incident_id):
    _write_interview(interviews_dir, incident_id)
    (interviews_dir / f"{incident_id}.verdict.json").write_text("{not json", encoding="utf-8")
    body = client.get(f"/api/audits/postmortem/{incident_id}/interview").json()
    assert body["verdict"] == "PENDING"
    assert body["regulatory_fine_adjustment"] == 0.0


def test_interview_post_falls_back_to_offline_auditor_without_llm_key(client, interviews_dir, incident_id, monkeypatch):
    monkeypatch.setattr(settings, "LLM_API_KEY", "")
    resp = client.post(f"/api/audits/postmortem/{incident_id}/interview", json={"message": "hi"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["verdict"] in ("PENDING", "VALID", "JUSTIFIED", "NON_COMPLIANT")
    assert body["reply"]
    assert body["source"] == "offline"


def test_offline_auditor_is_deterministic_and_reaches_a_verdict():
    from app.engine import offline_auditor

    context = {
        "mtta_ticks": 14, "mttr_ticks": 5, "root_cause_confirmed": False, "tech_debt_delta": 8,
        "mitigations": [{"action": "Hotfix Prod Live", "fully_resolved": True}],
    }
    transcript = [{"role": "player", "content": "ok"}]
    first = offline_auditor.respond(context, transcript)
    assert first["verdict"] == "PENDING" and "unacknowledged" in first["reply"]
    assert offline_auditor.respond(context, transcript) == first
    transcript += [{"role": "auditor", "content": first["reply"]}, {"role": "player", "content": "no"}]
    transcript += [{"role": "auditor", "content": "q2"}, {"role": "player", "content": "no"}]
    final = offline_auditor.respond(context, transcript)
    assert final["verdict"] == "NON_COMPLIANT" and final["regulatory_fine_adjustment"] > 0


def test_offline_auditor_clean_record_earns_credit():
    from app.engine import offline_auditor

    context = {"mtta_ticks": 2, "mttr_ticks": 4, "root_cause_confirmed": True, "tech_debt_delta": 0,
               "mitigations": [{"action": "Rollback", "fully_resolved": True}]}
    out = offline_auditor.respond(context, [{"role": "player", "content": "hello"}])
    assert out["verdict"] == "VALID" and out["regulatory_fine_adjustment"] < 0


def test_session_reset_archives_ledger_and_emits_event(client):
    client.post("/api/session/reset")
    client.post("/api/session/pause")
    engine = app.state.engine
    engine._log_audit_event("INCIDENT_RAISED", "AUTOMATED_MONITOR", {"incident_id": "inc-x"}, True)
    client.post("/api/session/reset")
    client.post("/api/session/pause")
    events = [e for e in engine.audit_logs if e["event_type"] == "SESSION_ARCHIVED_AND_PURGED"]
    assert len(events) == 1
    assert events[0]["actor"] == "PLATFORM" and events[0]["details"]["event_count"] >= 1
    from app.models.archived_ledger import ArchivedAuditLedger

    db = SessionLocal()
    try:
        row = db.get(ArchivedAuditLedger, events[0]["details"]["archive_id"])
        assert row is not None and row.ledger_checksum == events[0]["details"]["ledger_checksum"]
    finally:
        db.close()


def test_interview_post_rejects_oversized_message(client, interviews_dir, incident_id, monkeypatch):
    monkeypatch.setattr(settings, "LLM_API_KEY", "test-key")
    resp = client.post(f"/api/audits/postmortem/{incident_id}/interview", json={"message": "x" * 2001})
    assert resp.status_code == 422


def test_interview_flow_preview_then_apply_once(client, interviews_dir, incident_id, monkeypatch):
    monkeypatch.setattr(settings, "LLM_API_KEY", "test-key")
    monkeypatch.setattr(audits, "_interview_call_log", audits.defaultdict(list))

    async def fake_llm(context, transcript):
        return {"reply": "You are non-compliant.", "verdict": "NON_COMPLIANT", "regulatory_fine_adjustment": 99999.0}

    monkeypatch.setattr(audits, "_invoke_auditor_llm", fake_llm)

    resp = client.post(f"/api/audits/postmortem/{incident_id}/interview", json={"message": "I did my best"})
    assert resp.status_code == 200
    turn = resp.json()
    assert turn["verdict"] == "NON_COMPLIANT"
    assert turn["regulatory_fine_adjustment"] == 3000.0
    assert turn["adjustment_cap"] == 3000.0
    assert turn["applied"] is False

    before = app.state.engine.budget
    applied = client.post(f"/api/audits/postmortem/{incident_id}/interview/apply-verdict")
    assert applied.status_code == 200
    body = applied.json()
    assert body["applied_amount"] == 3000.0
    assert body["verdict"] == "NON_COMPLIANT"
    assert body["budget"] == pytest.approx(before - 3000.0)

    again = client.post(f"/api/audits/postmortem/{incident_id}/interview/apply-verdict")
    assert again.status_code == 400
    assert "already been applied" in again.json()["detail"]

    resumed = client.get(f"/api/audits/postmortem/{incident_id}/interview").json()
    assert resumed["applied"] is True
    assert len(resumed["turns"]) == 2


def test_apply_verdict_rejects_a_pending_verdict(client, interviews_dir, incident_id):
    _write_interview(interviews_dir, incident_id, verdict="PENDING", proposed=0.0)
    resp = client.post(f"/api/audits/postmortem/{incident_id}/interview/apply-verdict")
    assert resp.status_code == 400


def test_rate_limit_429_carries_retry_after(monkeypatch):
    monkeypatch.setattr(audits, "_interview_call_log", audits.defaultdict(list))
    for _ in range(audits._INTERVIEW_RATE_LIMIT_MAX_CALLS):
        audits._check_interview_rate_limit("1.2.3.4")
    with pytest.raises(HTTPException) as exc:
        audits._check_interview_rate_limit("1.2.3.4")
    assert exc.value.status_code == 429
    assert 1 <= int(exc.value.headers["Retry-After"]) <= 61
