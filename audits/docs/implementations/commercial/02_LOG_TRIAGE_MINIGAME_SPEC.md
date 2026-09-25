# Active Log Triage & Root-Cause Investigation Mini-Game — Implementation Specification

**Document ID:** IZ-COMM-02
**Classification:** Implementation Contract — Commercial Pillar 2
**Status:** Implemented, additive only, non-breaking
**Integration baseline:** `backend/app/engine/event_generator.py`, `backend/app/models/incident.py`, `backend/app/api/v1/incidents.py`

---

## 1. System Objective

Turn root-cause diagnosis from a passive narrative field (`Incident.root_cause`, a flavor string) into an active mini-game: a synthetic, plausible log stream is generated once per incident, one line is the deterministic root cause, and correctly identifying it under time pressure grants a real mechanical reward — a 50% mitigation cost discount and an immediate MTTR head-start.

## 2. Synthetic Log Streamer

`backend/app/engine/log_generator.py` defines four line-template pools keyed by level (`INFO`, `WARN`, `ERROR`, `FATAL`) — HTTP access lines, stack-trace fragments, OOM-killer notices, deadlock warnings, and connection-pool timeouts — plus:

```python
def generate_incident_log_stream(incident: Dict[str, Any]) -> Dict[str, Any]:
    """BUILD A DETERMINISTIC SYNTHETIC LOG STREAM FOR ONE INCIDENT, WITH ONE MARKED ROOT-CAUSE LINE"""
```

This is called exactly once, at incident-creation time (`build_incident` in `event_generator.py`), and the resulting `{"lines": [...], "root_cause_line_id": ...}` is stored directly on the in-memory incident dict as `log_lines`/`root_cause_line_id` — never regenerated on subsequent reads, so the same incident always shows the same stream. These two keys are deliberately **not** columns on the `Incident` model (they are large, incident-instance-specific, and reconstructible only at creation time); they ride along in the existing in-memory dict exactly the way `dependencies` rides along on service dicts without a matching SQL column.

Each line: `{"id": "log-...", "tick_offset": int, "level": "INFO"|"WARN"|"ERROR"|"FATAL", "message": str}`. The root-cause line is always an `ERROR` or `FATAL` line drawn from a pool that narratively matches `incident.root_cause`'s existing text, so the two fields agree.

## 3. Data Contract — Additive Column

`Incident` gains one new column, `triage_solved = Column(Boolean, nullable=False, default=False)` — additive, defaulting false, no existing row or query affected.

## 4. REST Endpoints

- `GET /api/incidents/{incident_id}/logs` — returns `{"lines": [...]}`. The `root_cause_line_id` is **never** sent to the client; the server is the sole arbiter of correctness.
- `POST /api/incidents/{incident_id}/triage` — body `{"line_id": str}`. If it matches the stored root cause and the incident is not already solved: sets `triage_solved = True`, immediately halves the incident's live `mttr_seconds` counter (the concrete mechanical form of "accelerates MTTR resolution speed by 2x" — pulling the elapsed-time clock backward by half is equivalent to having resolved twice as fast from this point on, and immediately cheapens every subsequent `incident_surcharge` computation), logs `ROOT_CAUSE_IDENTIFIED`, and returns `{"success": true, "correct": true}`. An incorrect guess returns `{"success": true, "correct": false}` with no state change and no retry limit — the terminal stays interactive.

## 5. Reward Application

`apply_mitigation` (`simulator.py`) gains one additional caller-side discount check, applied after the existing `automated_cicd` rollback discount and composing multiplicatively with it: if any `active`/`acknowledged` incident on the target `service_id` has `triage_solved = True`, `effective_cost *= 0.50`. This is a pure multiplier on top of whatever `effective_cost` already is, so a triaged `rollback` under `automated_cicd` costs `1800 * 0.50 * 0.50 = $450`, fully transparent in the `RUNBOOK_EXECUTED` audit payload's `cost` field.

## 6. Interactive Triage Terminal (Frontend)

`components/modals/LogTriageTerminal.tsx`: a dark, CRT-styled slide-up drawer (green-on-black monospace, scanline overlay via a repeating linear-gradient) opened from a new "Investigate Logs" button in `IncidentDetailModal.tsx` when the incident's service is `degraded`/`down`. Fetches `GET /api/incidents/{id}/logs` once on open; four level-filter toggle buttons (`INFO`/`WARN`/`ERROR`/`FATAL`) client-side filter the rendered list; clicking a line calls `POST /api/incidents/{id}/triage`, and on a correct guess the line highlights green with a "ROOT CAUSE CONFIRMED" banner and a floating-text reward notice; an incorrect guess flashes the line red briefly without penalty.
