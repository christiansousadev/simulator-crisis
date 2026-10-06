import asyncio
import json
import random
import threading
import uuid
from collections import deque
from typing import Any, Deque, Dict, List, Optional, Set

from fastapi import WebSocket

from app.core.database import SessionLocal
from app.engine import achievements, cosmetics, dilemmas, formulas, infrastructure, staff, upgrades
from app.engine.event_generator import build_audit_entry, build_incident, cause_category_for_root_cause
from app.engine.scenarios import SCENARIO_REGISTRY
from app.engine.scenarios.custom_scenario import CustomScenario
from app.models.achievement import Achievement
from app.models.audit import AuditLog
from app.models.career import CareerRecord
from app.models.cosmetic import UnlockedCosmetic
from app.models.dilemma import DilemmaEvent
from app.models.engineer import Engineer
from app.models.incident import Incident
from app.models.infrastructure import InfrastructureNode
from app.models.service import Service
from app.models.session import CURRENT_SCHEMA_VERSION, GameSession
from app.models.upgrade import PurchasedUpgrade

DEFAULT_PLAYER_ID = "local-player"

# starting budget and incident-hazard multiplier per difficulty preset, applied on reset()
DIFFICULTY_PRESETS: Dict[str, Dict[str, float]] = {
    "intern": {"starting_budget": 320000.0, "hazard_multiplier": 0.7},
    "standard": {"starting_budget": 250000.0, "hazard_multiplier": 1.0},
    "chaos": {"starting_budget": 180000.0, "hazard_multiplier": 1.4},
}
DEFAULT_DIFFICULTY = "standard"

# the canonical set of service ids that exist in the game's fixed topology (see
# _init_default_services) -- the single source of truth for "which service ids are valid,"
# reused wherever a service_id needs validating (e.g. schemas/scenario.py's ChaosInjection)
# without depending on app.engine.staff.SERVICE_COMPETENCY_MAP, which only maps an EXISTING
# service to its nearest competency and must never be mistaken for the service catalog itself.
CANONICAL_SERVICE_IDS = ("srv-auth", "srv-payment", "srv-api-gw", "srv-search", "srv-notify")

# governance reputation thresholds that tip the incident-hazard multiplier one way or the other
REPUTATION_CRISIS_THRESHOLD = 25.0
REPUTATION_TRUSTED_THRESHOLD = 75.0
REPUTATION_CRISIS_HAZARD_MULTIPLIER = 1.15
REPUTATION_TRUSTED_HAZARD_MULTIPLIER = 0.9

# ambient technical debt relief granted after a sustained quiet period
QUIET_REFACTOR_INTERVAL_TICKS = 20
QUIET_REFACTOR_TDI_RELIEF = 1

# simultaneous alarm throttle to keep the war room playable
MAX_CONCURRENT_INCIDENTS = 4

# bounded in-memory financial ledger: a runtime CACHE for recent-activity introspection, deliberately
# separate from durable history -- AuditLog is the durable source of truth for every category
# listed in _LEDGER_RECONSTRUCTION_MAP below (mitigation cost, fines, dilemma outcomes, hiring,
# upgrades, infrastructure), which is exactly why this cache is safe to reconstruct from AuditLog
# on restore (see _reconstruct_financial_ledger) instead of also persisting a second, duplicate
# copy of the same movements. the two routine per-tick categories (operational_expense/
# incident_surcharge) deliberately skip AuditLog's per-call db write (see _apply_financial_event)
# to avoid flooding the audit trail every single tick, so THOSE two categories' individual entries
# are not reconstructable and start empty again after a restart -- a known, accepted, documented
# gap, since nothing in the codebase reads financial_ledger across a restart for them today.
FINANCIAL_LEDGER_MAX_ENTRIES = 500

# maps a durably-audited financial event_type to (ledger category, reference-extractor) so
# _reconstruct_financial_ledger can rebuild ledger-shaped entries straight from AuditLog rows --
# covers every category _apply_financial_event actually audits (see its own docstring)
_LEDGER_RECONSTRUCTION_MAP: Dict[str, Any] = {
    "RUNBOOK_EXECUTED": ("mitigation_cost", lambda d: d.get("incident_id") or d.get("service_id")),
    "UNATTENDED_ALERT_VIOLATION": ("regulatory_fine", lambda d: d.get("incident_id")),
    "AI_AUDITOR_VERDICT_APPLIED": ("regulatory_fine", lambda d: d.get("incident_id")),
    "DILEMMA_RESOLVED": ("dilemma_outcome", lambda d: d.get("dilemma_id")),
    "ENGINEER_HIRED": ("hiring_cost", lambda d: d.get("engineer_id")),
    "UPGRADE_PURCHASED": ("upgrade_purchase", lambda d: d.get("upgrade_id")),
    "INFRASTRUCTURE_NODE_PLACED": ("infrastructure_purchase", lambda d: d.get("node_id")),
}

# one monthly sla audit cycle, per the architecture tick scale
VICTORY_TICK_THRESHOLD = 720

# minimum ticks before the cumulative sla is considered statistically meaningful
BREACH_GRACE_TICKS = 24

# rolling sample window used to derive the error budget burn rate
ERROR_BUDGET_BURN_RATE_WINDOW = 10

# a service counts as genuinely healthy for runbook purposes only below these readings: a scripted
# scenario's pressure (black friday/ddos latency creep, third-party downstream bleed) leaves a
# "healthy"-status service visibly sick, and a runbook there is a legitimate remediation. the
# default topology tops out at 84ms / 0.0005 error rate, so there is wide headroom above baseline
HEALTHY_LATENCY_CEILING_MS = 150
HEALTHY_ERROR_RATE_CEILING = 0.01

# advance warning window granted by the predictive anomaly detection upgrade
PRE_ALERT_LEAD_TICKS = 5


class SimulationEngine:
    """MANAGES THE CRISIS SIMULATION TICK LOOP, STATE EVOLUTION AND PERSISTENCE"""

    def __init__(
        self,
        session_id: str = "default-session",
        scenario_id: Optional[str] = None,
        player_id: str = DEFAULT_PLAYER_ID,
        difficulty: str = DEFAULT_DIFFICULTY,
    ):
        self.session_id: str = session_id
        # serializes every DB write against the periodic background-thread snapshot write (see
        # _run_loop/_persist_snapshot_data) so the two can never interleave their actual commits --
        # a real threading.Lock (not asyncio.Lock), since the snapshot write runs on a genuine OS
        # thread via asyncio.to_thread while every other write here runs synchronously on the main
        # thread; briefly serializing two fast local sqlite writes never blocks simulation logic
        # itself, only the other write, if one happens to be in flight at the same instant.
        self._db_write_lock = threading.Lock()
        self.player_id: str = player_id
        self.player_name: str = "VP of Infrastructure"
        self.is_running: bool = False
        self.status: str = "running"
        self.tick_rate_seconds: float = 1.0
        self.current_tick: int = 0
        self.difficulty: str = difficulty if difficulty in DIFFICULTY_PRESETS else DEFAULT_DIFFICULTY
        self._difficulty_hazard_multiplier: float = DIFFICULTY_PRESETS[self.difficulty]["hazard_multiplier"]
        self.budget: float = DIFFICULTY_PRESETS[self.difficulty]["starting_budget"]
        self.tech_debt: int = 25
        self.user_happiness: float = 96.0
        self.sla_percentage: float = 100.0
        # rolling window of per-tick instantaneous SLA samples, bounded to one audit cycle
        # (VICTORY_TICK_THRESHOLD ticks) -- NOT an all-time average since tick 0, which would let
        # a single very old sample keep diluting the score indefinitely long after it stopped
        # being representative of current performance
        self._sla_window: Deque[float] = deque(maxlen=VICTORY_TICK_THRESHOLD)
        # bounded, traceable RUNTIME CACHE of recent cash movements (see _apply_financial_event) --
        # deliberately not the durable history: AuditLog already is that, for every category this
        # ledger can reconstruct from on restore (see _reconstruct_financial_ledger and
        # FINANCIAL_LEDGER_MAX_ENTRIES's own comment for exactly which categories and why)
        self.financial_ledger: List[Dict[str, Any]] = []
        self.quiet_ticks: int = 0
        # governance reputation: a persistent (never reset mid-run) score shaped by CAB dilemma
        # choices, tilting the incident hazard multiplier and gating which dilemmas can appear
        self.reputation: float = 50.0
        self.active_websockets: Set[WebSocket] = set()
        self._loop_task: Optional[asyncio.Task] = None
        self.services: List[Dict[str, Any]] = self._init_default_services()
        self.incidents: List[Dict[str, Any]] = []
        self.audit_logs: List[Dict[str, Any]] = []

        # tech tree and office upgrades
        self.purchased_upgrade_ids: Set[str] = set()
        self.pending_pre_alerts: List[Dict[str, Any]] = []

        # server-side runbook cooldown tracking (action_id -> tick last fired), mirroring the
        # client-only cooldown MitigationsPanel renders -- without this, apply_mitigation had
        # no cooldown enforcement of its own, so a scripted client could fire a runbook every
        # tick regardless of MITIGATION_CATALOG's declared cooldown_ticks
        self.mitigation_last_fired_tick: Dict[str, int] = {}

        # error budget governance
        self._error_budget_history: List[float] = []
        self.error_budget_remaining_ratio: float = 1.0
        self.error_budget_burn_rate: float = 0.0
        self.feature_freeze_active: bool = False

        # cab dilemma engine
        self.next_dilemma_tick: int = random.randint(
            formulas.CAB_DILEMMA_MIN_INTERVAL_TICKS, formulas.CAB_DILEMMA_MAX_INTERVAL_TICKS
        )
        self.active_dilemma: Optional[Dict[str, Any]] = None
        # temporary, decision-caused hazard windows (e.g. a corner-cutting dilemma choice),
        # each {"multiplier": float, "expires_at_tick": int, "source": str} -- pruned and folded
        # into the failure roll in _evaluate_random_failures
        self._temporary_hazard_effects: List[Dict[str, Any]] = []

        # staff on-call roster, empty until explicitly hired
        self.engineers: List[Dict[str, Any]] = []

        # scenario orchestration, none for the default sandbox
        self.active_scenario: Optional[Any] = None
        self._scenario_hazard_multiplier: float = 1.0
        if scenario_id:
            scenario_cls = SCENARIO_REGISTRY.get(scenario_id)
            if scenario_cls:
                self.active_scenario = scenario_cls(self)

        # build-mode infrastructure nodes, empty until explicitly placed
        self.infrastructure_nodes: List[Dict[str, Any]] = []

        # achievements and career progression: rehydrated from prior runs, never wiped by reset()
        self.achievements_unlocked: Set[str] = set()
        self.prestige_points: int = 0
        self.unlocked_cosmetics: Set[str] = set()
        self._resolved_incident_count: int = 0
        self._night_shift_ack_seen: bool = False
        self._first_response_seen: bool = False
        self._load_career_progress()

        # out-of-band ws frames queued during a sync tick, flushed after the regular broadcast
        self._pending_broadcasts: List[Dict[str, Any]] = []

        # true once this process instance has resumed from a prior process's persisted snapshot
        # (as opposed to a freshly bootstrapped run) -- see _try_restore_from_snapshot and
        # _persist_career_record's recovered_from_snapshot column
        self._recovered_from_snapshot: bool = False

        # crash/restart resilience: if a prior process left an in-progress run for this exact
        # session_id, pick it back up instead of silently discarding it -- difficulty, scenario,
        # reputation, active incidents (including investigation progress), purchased upgrades,
        # placed infrastructure, a pending dilemma, mitigation cooldowns, temporary hazard
        # windows, rng continuity and the audit trail are all resumed; see
        # _try_restore_from_snapshot for exactly what is (and, for genuinely ephemeral state like
        # websocket connections, isn't) restorable.
        if not self._try_restore_from_snapshot():
            self._persist_bootstrap()

    def _init_default_services(self) -> List[Dict[str, Any]]:
        """INITIALIZE CORE PLATFORM SERVICES WITH TIER TOPOLOGY.

        DEPENDENCY DIRECTION, DEFINED HERE ONCE AND AUTHORITATIVE EVERYWHERE ELSE IN THE ENGINE:
        `"dependencies": [X, ...]` ON A SERVICE Y MEANS "Y DEPENDS ON X" -- X IS UPSTREAM, A HARD
        PREREQUISITE FOR Y. EVERY MECHANIC THAT WALKS THIS GRAPH MUST BE EXPLICIT ABOUT WHICH WAY
        IT'S GOING RATHER THAN ASSUMING THE SAME DIRECTION FITS A DIFFERENT MECHANIC:
          - OPERATIONAL FAILURE CASCADE (formulas.cascading_failure_probability/
            dependency_shock_multiplier, used by _evaluate_random_failures below): AN UNHEALTHY
            UPSTREAM DEPENDENCY (X) RAISES ITS DOWNSTREAM DEPENDENT'S (Y'S) OWN FAILURE HAZARD --
            "X DOWN HURTS WHOEVER DEPENDS ON X." THIS IS THE CORRECT DIRECTION FOR AVAILABILITY.
          - fan-in/"WHO DEPENDS ON ME" (formulas.dependents_count): THE DELIBERATE REVERSE VIEW OF
            THE SAME ARRAY -- COUNTS OTHER SERVICES THAT LIST A GIVEN service_id AS A DEPENDENCY.
          - A SECURITY COMPROMISE (scenarios/ransomware_infiltration.py) INTENTIONALLY WALKS THE
            OPPOSITE DIRECTION FROM THE OPERATIONAL CASCADE ABOVE: A COMPROMISED SERVICE PIVOTS
            INTO WHAT IT ITSELF DEPENDS ON (ITS OWN OUTBOUND CONNECTIONS/CREDENTIALS), NOT INTO
            WHOEVER DEPENDS ON IT -- SEE THAT FILE'S on_tick DOCSTRING FOR WHY."""
        services = [
            {
                "id": "srv-auth",
                "session_id": self.session_id,
                "name": "Identity & Auth Service",
                "tier": "critical",
                "status": "healthy",
                "latency_ms": 32,
                "error_rate": 0.0001,
                "dependencies": [],
            },
            {
                "id": "srv-payment",
                "session_id": self.session_id,
                "name": "Payment Gateway Core",
                "tier": "critical",
                "status": "healthy",
                "latency_ms": 68,
                "error_rate": 0.0002,
                "dependencies": ["srv-auth"],
            },
            {
                "id": "srv-api-gw",
                "session_id": self.session_id,
                "name": "Public API Edge",
                "tier": "critical",
                "status": "healthy",
                "latency_ms": 22,
                "error_rate": 0.0000,
                "dependencies": ["srv-auth", "srv-payment"],
            },
            {
                "id": "srv-search",
                "session_id": self.session_id,
                "name": "Catalog Search Index",
                "tier": "standard",
                "status": "healthy",
                "latency_ms": 84,
                "error_rate": 0.0005,
                "dependencies": ["srv-api-gw"],
            },
            {
                "id": "srv-notify",
                "session_id": self.session_id,
                "name": "Notification Dispatcher",
                "tier": "standard",
                "status": "healthy",
                "latency_ms": 40,
                "error_rate": 0.0001,
                "dependencies": ["srv-api-gw"],
            },
        ]
        # keeps CANONICAL_SERVICE_IDS (the module-level source every external validator should
        # use) from ever silently drifting out of sync with the actual topology defined above
        assert {s["id"] for s in services} == set(CANONICAL_SERVICE_IDS), (
            "CANONICAL_SERVICE_IDS is out of sync with _init_default_services"
        )
        return services

    # --- persistence -----------------------------------------------------

    def _try_restore_from_snapshot(self) -> bool:
        """REHYDRATE FROM A PRIOR PROCESS'S LAST PERSISTED SNAPSHOT, IF ONE EXISTS AND IS RESUMABLE

        Returns True when restoration succeeded and the fresh-bootstrap path should be skipped.
        A snapshot is only resumable if it belongs to this exact session_id, its run had not
        already reached a terminal state (a finished game should not silently "come back"), and
        its schema_version matches what this exact code version knows how to interpret.
        """
        db = SessionLocal()
        try:
            row = db.get(GameSession, self.session_id)
            if row is None or row.status in ("bankrupted", "victory") or row.current_tick <= 0:
                return False
            if row.schema_version != CURRENT_SCHEMA_VERSION:
                # an incompatible/unknown snapshot shape: refuse explicitly rather than risk
                # misinterpreting fields that may not exist or mean something different in this
                # code version. this is NEVER silently converted into a fresh session over the
                # same identifier -- see _quarantine_incompatible_snapshot, which preserves every
                # genuinely historical row (incidents/audit trail/engineers/upgrades/dilemmas/
                # infrastructure) under a distinct id before falling through to a real fresh
                # bootstrap under the original session_id.
                self._log_audit_event(
                    event_type="SNAPSHOT_VERSION_MISMATCH",
                    actor="PLATFORM",
                    details={"found_version": row.schema_version, "expected_version": CURRENT_SCHEMA_VERSION},
                    compliance_flag=False,
                )
                self._quarantine_incompatible_snapshot(db)
                return False

            self.status = row.status
            self.current_tick = row.current_tick
            self.budget = float(row.budget)
            self.tech_debt = row.tech_debt
            self.user_happiness = float(row.user_happiness)
            self.sla_percentage = float(row.sla_percentage)
            # the rolling window's real individual samples are restored in full when present (see
            # _session_scalars_kwargs) -- this is what makes the very next tick's average compute
            # exactly as it would have without the restart, instead of only matching right at the
            # moment of restore and then drifting the instant an old sample would have aged out.
            # legacy rows written before this column existed fall back to the previous
            # single-value seed (matches the restored scalar exactly, but drifts on window aging).
            self._sla_window = self._deserialize_sla_window(row.sla_window_json, self.sla_percentage)
            self.prestige_points = row.prestige_points
            self.quiet_ticks = row.quiet_ticks or 0
            self.difficulty = row.difficulty if row.difficulty in DIFFICULTY_PRESETS else DEFAULT_DIFFICULTY
            self._difficulty_hazard_multiplier = DIFFICULTY_PRESETS[self.difficulty]["hazard_multiplier"]
            self.reputation = float(row.reputation)

            # error budget / feature freeze are pure functions of sla_percentage (see formulas.py),
            # but the short burn-rate history feeding error_budget_burn_rate is real restored
            # history (same reasoning as the SLA window above), not a single reseeded sample
            burn_ratio = formulas.error_budget_burn_ratio(self.sla_percentage)
            self.error_budget_remaining_ratio = formulas.error_budget_remaining_ratio(burn_ratio)
            self.feature_freeze_active = self.error_budget_remaining_ratio <= 0.0
            self._error_budget_history = self._deserialize_error_budget_history(
                row.error_budget_history_json, burn_ratio
            )

            if row.mitigation_cooldowns_json:
                try:
                    self.mitigation_last_fired_tick = {
                        action_id: int(tick) for action_id, tick in json.loads(row.mitigation_cooldowns_json).items()
                    }
                except (ValueError, TypeError, AttributeError):
                    self.mitigation_last_fired_tick = {}

            if row.temporary_hazard_effects_json:
                try:
                    self._temporary_hazard_effects = json.loads(row.temporary_hazard_effects_json)
                except (ValueError, TypeError):
                    self._temporary_hazard_effects = []

            if row.random_state_json:
                try:
                    version, internal_state, gauss_next = json.loads(row.random_state_json)
                    random.setstate((version, tuple(internal_state), gauss_next))
                except (ValueError, TypeError, IndexError):
                    # keep whatever fresh, os-seeded state random already has rather than crash
                    # on a corrupt/foreign blob
                    pass

            # scripted scenario, including its own extra runtime state (e.g. ransomware's
            # infection spread, custom's player-supplied config) -- see ScenarioEngine.restore_extra
            self.active_scenario = None
            self._scenario_hazard_multiplier = 1.0
            if row.scenario_id:
                scenario_state = json.loads(row.scenario_state_json) if row.scenario_state_json else {}
                extra = scenario_state.get("extra", {})
                if row.scenario_id == "custom":
                    config = extra.get("config")
                    if config:
                        self.active_scenario = CustomScenario(self, config)
                else:
                    scenario_cls = SCENARIO_REGISTRY.get(row.scenario_id)
                    if scenario_cls:
                        self.active_scenario = scenario_cls(self)
                if self.active_scenario:
                    self.active_scenario.elapsed_ticks = scenario_state.get("elapsed_ticks", 0)
                    self.active_scenario.completed = scenario_state.get("completed", False)
                    self.active_scenario.outcome = scenario_state.get("outcome")
                    self.active_scenario.restore_extra(extra)

            restored_services = db.query(Service).filter(Service.session_id == self.session_id).all()
            restored_incident_rows = (
                db.query(Incident)
                .filter(Incident.session_id == self.session_id, Incident.status.in_(("active", "acknowledged")))
                .all()
            )
            # worst still-open severity per service, so restored service health is *derived* from
            # the incident being resumed rather than trusted from a service row that may be
            # slightly stale (services are only durably persisted once per tick, not immediately
            # on every status change)
            open_severity_by_service: Dict[str, str] = {}
            for i in restored_incident_rows:
                if i.severity == "P1_CRITICAL" or i.service_id not in open_severity_by_service:
                    open_severity_by_service[i.service_id] = i.severity

            if restored_services:
                self.services = [
                    {
                        "id": s.id,
                        "session_id": s.session_id,
                        "name": s.name,
                        "tier": s.tier,
                        "status": (
                            "down"
                            if open_severity_by_service.get(s.id) == "P1_CRITICAL"
                            else "degraded"
                            if s.id in open_severity_by_service
                            else "healthy"
                        ),
                        "latency_ms": s.latency_ms,
                        "error_rate": float(s.error_rate),
                        "dependencies": json.loads(s.dependencies_json),
                    }
                    for s in restored_services
                ]

            # active incidents: fully resumed, including investigation progress -- never dropped
            self.incidents = [
                {
                    "id": i.id,
                    "session_id": i.session_id,
                    "service_id": i.service_id,
                    "severity": i.severity,
                    "title": i.title,
                    "root_cause": i.root_cause,
                    "mtta_seconds": i.mtta_seconds,
                    "mttr_seconds": i.mttr_seconds,
                    "status": i.status,
                    "created_tick": i.created_tick,
                    "acknowledged_tick": i.acknowledged_tick,
                    "resolved_tick": i.resolved_tick,
                    "triage_solved": i.triage_solved,
                    "log_lines": json.loads(i.log_lines_json) if i.log_lines_json else [],
                    "root_cause_line_id": i.root_cause_line_id,
                    "triage_wrong_attempts": i.triage_wrong_attempts or 0,
                    "triage_accuracy": float(i.triage_accuracy) if i.triage_accuracy is not None else None,
                    "tech_debt_at_creation": i.tech_debt_at_creation,
                    "tech_debt_at_resolution": i.tech_debt_at_resolution,
                    "accrued_surcharge": float(i.accrued_surcharge or 0.0),
                }
                for i in restored_incident_rows
            ]

            self.engineers = [
                {
                    "id": e.id,
                    "session_id": e.session_id,
                    "name": e.name,
                    "assigned_service_id": e.assigned_service_id,
                    "core_competency": e.core_competency,
                    "stress_index": float(e.stress_level),
                    "stamina": e.stamina,
                    "on_call_status": e.on_call_status,
                    "hired_at_tick": e.hired_at_tick,
                }
                for e in db.query(Engineer).filter(Engineer.session_id == self.session_id).all()
            ]

            # purchased upgrades and placed infrastructure: the tables were already being written,
            # just never read back -- the player was paying for these and losing them on restart
            self.purchased_upgrade_ids = {
                u.upgrade_id
                for u in db.query(PurchasedUpgrade).filter(PurchasedUpgrade.session_id == self.session_id).all()
            }
            self.infrastructure_nodes = [
                {
                    "id": n.id,
                    "session_id": n.session_id,
                    "node_type": n.node_type,
                    "grid_x": float(n.grid_x),
                    "grid_y": float(n.grid_y),
                    "status": n.status,
                    "config_json": n.config_json,
                }
                for n in db.query(InfrastructureNode).filter(InfrastructureNode.session_id == self.session_id).all()
            ]

            # a dilemma offered but never resolved before the crash resumes exactly as it was,
            # original expiry tick included -- if that tick has already passed, the very next
            # _evaluate_cab_dilemma() call auto-resolves it via the default choice, same as always
            pending_dilemma_row = (
                db.query(DilemmaEvent)
                .filter(DilemmaEvent.session_id == self.session_id, DilemmaEvent.resolved_at_tick.is_(None))
                .order_by(DilemmaEvent.offered_at_tick.desc())
                .first()
            )
            self.active_dilemma = None
            if pending_dilemma_row:
                template = next(
                    (d for d in dilemmas.DILEMMA_POOL if d["id"] == pending_dilemma_row.dilemma_key), None
                )
                restored_choices = json.loads(pending_dilemma_row.choices_json)
                self.active_dilemma = {
                    "id": pending_dilemma_row.id,
                    "dilemma_key": pending_dilemma_row.dilemma_key,
                    "title": pending_dilemma_row.title,
                    "narrative": template["narrative"] if template else "",
                    "choices": restored_choices,
                    "default_choice_id": (
                        template["default_choice_id"] if template else restored_choices[0]["id"]
                    ),
                    "offered_at_tick": pending_dilemma_row.offered_at_tick,
                    "expires_at_tick": pending_dilemma_row.expires_at_tick,
                    "resolved": False,
                    "resolved_choice_id": None,
                }
                # the frontend only ever learns about a dilemma via this exact DILEMMA_OFFERED
                # broadcast shape (see _evaluate_cab_dilemma) -- without re-queuing it here, a
                # resumed dilemma would silently tick toward its (still correctly preserved)
                # expiry with no way for the player to actually choose. flushed on the very next
                # tick by the existing flush_pending_broadcasts() call in _run_loop.
                self._pending_broadcasts.append(
                    {
                        "type": "DILEMMA_OFFERED",
                        "dilemma_id": self.active_dilemma["id"],
                        "title": self.active_dilemma["title"],
                        "narrative": self.active_dilemma["narrative"],
                        "choices": self.active_dilemma["choices"],
                        "expires_at_tick": self.active_dilemma["expires_at_tick"],
                    }
                )

            # achievement/objective progress: derived from the full persisted incident history
            # rather than a separately-tracked flag, so it can never silently reset on restart
            all_incident_rows = db.query(Incident).filter(Incident.session_id == self.session_id).all()
            self._resolved_incident_count = sum(1 for i in all_incident_rows if i.status == "resolved")
            self._first_response_seen = any(
                i.acknowledged_tick is not None and i.mtta_seconds <= 1 for i in all_incident_rows
            )
            self._night_shift_ack_seen = any(
                i.acknowledged_tick is not None and (i.acknowledged_tick % 24 >= 22 or i.acknowledged_tick % 24 < 5)
                for i in all_incident_rows
            )

            # audit trail: reload (most recent first, bounded, then put back in chronological
            # order) so the compliance ledger doesn't appear to start from nothing after a
            # restart, without risking an unbounded read on a very long-running session
            audit_rows = list(
                reversed(
                    db.query(AuditLog)
                    .filter(AuditLog.session_id == self.session_id)
                    .order_by(AuditLog.tick.desc())
                    .limit(1000)
                    .all()
                )
            )
            self.audit_logs = [
                {
                    "id": a.id,
                    "session_id": a.session_id,
                    "timestamp": a.timestamp.isoformat() if a.timestamp else "",
                    "tick": a.tick,
                    "event_type": a.event_type,
                    "actor": a.actor,
                    "details": json.loads(a.details_json),
                    "compliance_flag": a.compliance_flag,
                }
                for a in audit_rows
            ]
            self._reconstruct_financial_ledger()

            self._recovered_from_snapshot = True
            self._log_audit_event(
                event_type="SYSTEM_RESTORED",
                actor="PLATFORM",
                details={
                    "restored_tick": self.current_tick,
                    "resumed_incidents": len(self.incidents),
                    "resumed_upgrades": len(self.purchased_upgrade_ids),
                    "resumed_infrastructure_nodes": len(self.infrastructure_nodes),
                    "resumed_dilemma": bool(self.active_dilemma),
                },
                compliance_flag=True,
            )
            return True
        finally:
            db.close()

    def _quarantine_incompatible_snapshot(self, db: Any) -> None:
        """PRESERVE AN INCOMPATIBLE-SCHEMA SESSION'S GENUINELY HISTORICAL ROWS UNDER A DISTINCT,
        DEAD IDENTIFIER INSTEAD OF LETTING _persist_bootstrap's db.delete(existing) DESTROY THEM
        AND SILENTLY RECREATE A "FRESH" SESSION OVER THE EXACT SAME session_id.

        Only `services` rows are dropped here: they use the game's fixed catalog ids (e.g.
        "srv-auth") as their bare primary key (not composite with session_id), so they would
        collide with the fresh bootstrap this quarantine enables regardless of what session_id
        they're tagged with -- and they hold no session-specific history worth preserving (just a
        live status/latency/error-rate mirror of a run being abandoned as incompatible).

        Every other session-scoped table (incidents/audit_logs/engineers/purchased_upgrades/
        dilemma_events/infrastructure_nodes) already has a globally-unique id of its own, so it
        never collides with anything a fresh bootstrap creates -- only its session_id FOREIGN KEY
        needs to move to the quarantine id, so it stays correctly, distinctly associated with the
        abandoned run instead of silently reappearing as if it belonged to the next (unrelated)
        session that reuses the original session_id.

        Called with the SAME db session _try_restore_from_snapshot already has open, and commits
        once at the end -- the whole quarantine is one transaction."""
        quarantine_id = f"{self.session_id}-incompatible-{uuid.uuid4().hex[:8]}"
        for model in (Incident, AuditLog, Engineer, PurchasedUpgrade, DilemmaEvent, InfrastructureNode):
            db.query(model).filter(model.session_id == self.session_id).update(
                {"session_id": quarantine_id}, synchronize_session=False
            )
        db.query(Service).filter(Service.session_id == self.session_id).delete(synchronize_session=False)
        db.query(GameSession).filter(GameSession.id == self.session_id).update(
            {"id": quarantine_id}, synchronize_session=False
        )
        db.commit()

    def _serialize_scenario_state(self) -> Optional[str]:
        """CAPTURE THE ACTIVE SCENARIO'S FULL RESTORABLE STATE (COMMON FIELDS PLUS ITS OWN
        snapshot_extra()), OR None WHEN RUNNING IN THE SANDBOX WITH NO SCRIPTED SCENARIO"""
        if not self.active_scenario:
            return None
        return json.dumps(
            {
                "elapsed_ticks": self.active_scenario.elapsed_ticks,
                "completed": self.active_scenario.completed,
                "outcome": self.active_scenario.outcome,
                "extra": self.active_scenario.snapshot_extra(),
            }
        )

    @staticmethod
    def _deserialize_sla_window(raw: Optional[str], fallback_value: float) -> "Deque[float]":
        """REBUILD THE REAL, PERSISTED SLA SAMPLE WINDOW. FALLS BACK TO THE OLD SINGLE-VALUE SEED
        (MATCHES THE RESTORED SCALAR EXACTLY BUT DRIFTS AS SOON AS AN OLD SAMPLE WOULD AGE OUT OF
        THE WINDOW) FOR A LEGACY ROW PREDATING THIS COLUMN, OR A MALFORMED/EMPTY PAYLOAD."""
        if raw:
            try:
                values = json.loads(raw)
                if isinstance(values, list) and values:
                    return deque((float(v) for v in values), maxlen=VICTORY_TICK_THRESHOLD)
            except (ValueError, TypeError):
                pass
        return deque([fallback_value], maxlen=VICTORY_TICK_THRESHOLD)

    @staticmethod
    def _deserialize_error_budget_history(raw: Optional[str], fallback_value: float) -> List[float]:
        """REBUILD THE REAL, PERSISTED ERROR-BUDGET BURN-RATE HISTORY. SAME LEGACY/FALLBACK
        BEHAVIOR AS _deserialize_sla_window, FOR THE SAME REASON."""
        if raw:
            try:
                values = json.loads(raw)
                if isinstance(values, list) and values:
                    return [float(v) for v in values]
            except (ValueError, TypeError):
                pass
        return [fallback_value]

    def _reconstruct_financial_ledger(self) -> None:
        """REBUILD THE BOUNDED financial_ledger RUNTIME CACHE FROM self.audit_logs (ALREADY
        RELOADED FROM THE DURABLE AuditLog TABLE JUST ABOVE) INSTEAD OF PERSISTING A SEPARATE,
        DUPLICATE COPY OF THE SAME MOVEMENTS. COVERS EVERY CATEGORY _apply_financial_event ACTUALLY
        AUDITS (SEE _LEDGER_RECONSTRUCTION_MAP); THE TWO NEVER-AUDITED, PURELY-ROUTINE CATEGORIES
        (operational_expense/incident_surcharge) HAVE NO DURABLE PER-EVENT RECORD TO RECONSTRUCT
        FROM AND SIMPLY START EMPTY AGAIN -- A KNOWN, DOCUMENTED GAP, NOT AN OVERSIGHT (SEE
        FINANCIAL_LEDGER_MAX_ENTRIES'S OWN COMMENT)."""
        ledger = []
        for entry in self.audit_logs:
            mapping = _LEDGER_RECONSTRUCTION_MAP.get(entry["event_type"])
            if not mapping:
                continue
            category, reference_fn = mapping
            details = entry["details"]
            ledger.append(
                {
                    "id": entry["id"],
                    "tick": entry["tick"],
                    "category": category,
                    "amount": details.get("amount", 0.0),
                    "reference": reference_fn(details),
                    "balance_after": details.get("balance_after", 0.0),
                }
            )
        self.financial_ledger = ledger[-FINANCIAL_LEDGER_MAX_ENTRIES:]

    def _session_scalars_kwargs(self) -> Dict[str, Any]:
        """BUILD THE FULL SET OF game_sessions COLUMN VALUES FROM CURRENT ENGINE STATE. THE ONE
        PLACE THIS ROW SHAPE IS DEFINED, REUSED BY THE INITIAL BOOTSTRAP INSERT, THE PERIODIC
        FULL SNAPSHOT AND THE LIGHTWEIGHT OUT-OF-TICK-LOOP UPSERT SO THEY CAN NEVER DRIFT APART"""
        return {
            "id": self.session_id,
            "player_name": self.player_name,
            "budget": self.budget,
            "sla_percentage": self.sla_percentage,
            "tech_debt": self.tech_debt,
            "user_happiness": self.user_happiness,
            "status": self.status,
            "current_tick": self.current_tick,
            "prestige_points": self.prestige_points,
            "schema_version": CURRENT_SCHEMA_VERSION,
            "difficulty": self.difficulty,
            "reputation": self.reputation,
            "scenario_id": self.active_scenario.scenario_id if self.active_scenario else None,
            "scenario_state_json": self._serialize_scenario_state(),
            "mitigation_cooldowns_json": json.dumps(self.mitigation_last_fired_tick),
            "temporary_hazard_effects_json": json.dumps(self._temporary_hazard_effects),
            "quiet_ticks": self.quiet_ticks,
            "random_state_json": json.dumps(random.getstate()),
            "sla_window_json": json.dumps(list(self._sla_window)),
            "error_budget_history_json": json.dumps(self._error_budget_history),
        }

    def _service_kwargs(self, srv: Dict[str, Any]) -> Dict[str, Any]:
        """BUILD THE FULL SET OF services COLUMN VALUES FOR ONE SERVICE DICT -- THE ONE PLACE
        THIS ROW SHAPE IS DEFINED, REUSED BY _persist_bootstrap AND _build_snapshot_kwargs"""
        return {
            "id": srv["id"],
            "session_id": self.session_id,
            "name": srv["name"],
            "tier": srv["tier"],
            "status": srv["status"],
            "latency_ms": srv["latency_ms"],
            "error_rate": srv["error_rate"],
            "dependencies_json": json.dumps(srv["dependencies"]),
        }

    def _incident_kwargs(self, inc: Dict[str, Any]) -> Dict[str, Any]:
        """BUILD THE FULL SET OF incidents COLUMN VALUES FOR ONE INCIDENT DICT, INCLUDING THE
        INVESTIGATION-RESUME FIELDS (log stream, answer key, triage progress) -- THE ONE PLACE
        THIS ROW SHAPE IS DEFINED, REUSED BY EVERY _persist_incident*/_persist_snapshot CALL SITE"""
        return {
            "id": inc["id"],
            "session_id": inc["session_id"],
            "service_id": inc["service_id"],
            "severity": inc["severity"],
            "title": inc["title"],
            "root_cause": inc["root_cause"],
            "mtta_seconds": inc["mtta_seconds"],
            "mttr_seconds": inc["mttr_seconds"],
            "status": inc["status"],
            "created_tick": inc["created_tick"],
            "acknowledged_tick": inc["acknowledged_tick"],
            "resolved_tick": inc["resolved_tick"],
            "triage_solved": inc["triage_solved"],
            "log_lines_json": json.dumps(inc.get("log_lines", [])),
            "root_cause_line_id": inc.get("root_cause_line_id"),
            "triage_wrong_attempts": inc.get("triage_wrong_attempts", 0),
            "triage_accuracy": inc.get("triage_accuracy"),
            "tech_debt_at_creation": inc.get("tech_debt_at_creation"),
            "tech_debt_at_resolution": inc.get("tech_debt_at_resolution"),
            "accrued_surcharge": inc.get("accrued_surcharge", 0.0),
        }

    def _engineer_kwargs(self, eng: Dict[str, Any]) -> Dict[str, Any]:
        """BUILD THE FULL SET OF engineers COLUMN VALUES FOR ONE ENGINEER DICT"""
        return {
            "id": eng["id"],
            "session_id": eng["session_id"],
            "name": eng["name"],
            "assigned_service_id": eng["assigned_service_id"],
            "core_competency": eng["core_competency"],
            "stress_level": int(eng["stress_index"]),
            "stamina": int(eng["stamina"]),
            "on_call_status": eng["on_call_status"],
            "hired_at_tick": eng["hired_at_tick"],
        }

    def _persist_session_scalars(self, db: Optional[Any] = None) -> None:
        """UPSERT JUST THE game_sessions ROW. CHEAP ENOUGH (ONE ROW, ONE TRANSACTION) TO CALL
        SYNCHRONOUSLY RIGHT AFTER ANY DISCRETE, AUDITED ACTION (SEE _apply_financial_event) --
        NOT ONLY ONCE PER TICK -- SO A CRASH WHILE THE SIMULATION IS PAUSED CAN NEVER LOSE AN
        ALREADY-APPLIED ACTION'S SESSION-LEVEL EFFECT (BUDGET, COOLDOWNS, REPUTATION, ETC.)

        Pass an existing db session to fold this write into a caller's own shared transaction
        (see _apply_financial_event) instead of opening/committing/closing its own -- the caller
        is then responsible for the commit and for holding self._db_write_lock for the whole unit
        of work."""
        owns_session = db is None
        if owns_session:
            self._db_write_lock.acquire()
            db = SessionLocal()
        try:
            db.merge(GameSession(**self._session_scalars_kwargs()))
            if owns_session:
                db.commit()
        finally:
            if owns_session:
                db.close()
                self._db_write_lock.release()

    def _persist_bootstrap(self):
        """RESET DATABASE STATE FOR A FRESH SIMULATION RUN"""
        db = SessionLocal()
        try:
            existing = db.get(GameSession, self.session_id)
            if existing:
                # cascades to services, incidents, audit logs, upgrades, dilemmas and engineers
                db.delete(existing)
                db.commit()
            db.add(GameSession(**self._session_scalars_kwargs()))
            for srv in self.services:
                db.add(Service(**self._service_kwargs(srv)))
            db.commit()
        finally:
            db.close()

    def _build_snapshot_kwargs(self):
        """MATERIALIZE session/service/incident/engineer STATE INTO PLAIN, SELF-CONTAINED KWARGS
        DICTS -- MUST RUN SYNCHRONOUSLY ON THE CALLING (MAIN) THREAD, NEVER OFFLOADED. THE RESULT
        HOLDS NO REFERENCE BACK TO self.services/self.incidents/self.engineers, SO IT CAN SAFELY BE
        HANDED TO A BACKGROUND THREAD FOR THE ACTUAL DB WRITE (SEE _run_loop/_persist_snapshot_data):
        WITHOUT THIS SPLIT, A asyncio.to_thread() WORKER ITERATING THE LIVE DICTS/LISTS WHILE A
        CONCURRENT REQUEST HANDLER MUTATES THEM ON THE MAIN THREAD COULD PERSIST A TORN, PARTLY-OLD
        PARTLY-NEW COMBINATION OF FIELDS FOR THE SAME ROW."""
        return (
            self._session_scalars_kwargs(),
            [self._service_kwargs(s) for s in self.services],
            [self._incident_kwargs(i) for i in self.incidents],
            [self._engineer_kwargs(e) for e in self.engineers],
        )

    def _persist_snapshot_data(self, session_kwargs, service_kwargs_list, incident_kwargs_list, engineer_kwargs_list):
        """UPSERT ALREADY-MATERIALIZED KWARGS DICTS (SEE _build_snapshot_kwargs) INTO THE DATABASE,
        ALL IN ONE TRANSACTION. SAFE TO RUN ON A BACKGROUND THREAD: NOTHING HERE READS ENGINE STATE
        ANY MORE, ONLY THE PLAIN COPIES IT WAS HANDED. HOLDS self._db_write_lock FOR THE WHOLE
        WRITE, SO IT CAN NEVER INTERLEAVE ITS COMMIT WITH A SYNCHRONOUS PER-ACTION WRITE HAPPENING
        ON THE MAIN THREAD AT THE SAME INSTANT (SEE _run_loop -- THIS RUNS VIA asyncio.to_thread,
        A REAL OS THREAD, WHILE EVERY OTHER WRITE HERE RUNS SYNCHRONOUSLY ON THE MAIN THREAD)."""
        with self._db_write_lock:
            db = SessionLocal()
            try:
                db.merge(GameSession(**session_kwargs))
                for kwargs in service_kwargs_list:
                    db.merge(Service(**kwargs))
                for kwargs in incident_kwargs_list:
                    db.merge(Incident(**kwargs))
                for kwargs in engineer_kwargs_list:
                    db.merge(Engineer(**kwargs))
                db.commit()
            finally:
                db.close()

    def _persist_snapshot(self):
        """SYNCHRONOUS CONVENIENCE WRAPPER: BUILDS THE KWARGS AND WRITES THEM IMMEDIATELY ON THE
        CALLING THREAD. NOT USED BY THE TICK LOOP ITSELF -- SEE _run_loop, WHICH CALLS
        _build_snapshot_kwargs() SYNCHRONOUSLY ON THE MAIN THREAD FIRST, THEN OFFLOADS ONLY
        _persist_snapshot_data (WHICH TOUCHES NO LIVE ENGINE STATE) TO A BACKGROUND THREAD."""
        self._persist_snapshot_data(*self._build_snapshot_kwargs())

    def _persist_incident(self, inc: Dict[str, Any], db: Optional[Any] = None) -> None:
        """UPSERT A SINGLE INCIDENT ROW IMMEDIATELY, USED FOR TERMINAL STATE CHANGES AND ANY
        INVESTIGATION PROGRESS THAT SHOULD SURVIVE A RESTART.

        Pass an existing db session to fold this write into a caller's own shared transaction
        (e.g. incident row + its corresponding audit event, committed together as one logical
        unit -- see _trigger_service_failure/acknowledge_incident/submit_triage/apply_mitigation)
        instead of opening/committing/closing its own. The caller then owns the commit and holds
        self._db_write_lock for the whole unit of work."""
        owns_session = db is None
        if owns_session:
            self._db_write_lock.acquire()
            db = SessionLocal()
        try:
            db.merge(Incident(**self._incident_kwargs(inc)))
            if owns_session:
                db.commit()
        finally:
            if owns_session:
                db.close()
                self._db_write_lock.release()

    def _persist_upgrade_purchase(self, upgrade_id: str, cost: float):
        """RECORD A PERMANENT UPGRADE PURCHASE AS A NEW LEDGER ROW"""
        db = SessionLocal()
        try:
            db.add(
                PurchasedUpgrade(
                    id=f"upg-{uuid.uuid4().hex[:8]}",
                    session_id=self.session_id,
                    upgrade_id=upgrade_id,
                    level=1,
                    purchased_at_tick=self.current_tick,
                    cost_paid=cost,
                )
            )
            db.commit()
        finally:
            db.close()

    def _persist_dilemma_event(
        self,
        dilemma: Dict[str, Any],
        resolved_choice_id: Optional[str],
        resolved_at_tick: Optional[int],
        was_auto_resolved: bool,
    ):
        """UPSERT A CAB DILEMMA ROW, USED BOTH ON OFFER AND ON RESOLUTION"""
        db = SessionLocal()
        try:
            db.merge(
                DilemmaEvent(
                    id=dilemma["id"],
                    session_id=self.session_id,
                    dilemma_key=dilemma["dilemma_key"],
                    title=dilemma["title"],
                    offered_at_tick=dilemma["offered_at_tick"],
                    expires_at_tick=dilemma["expires_at_tick"],
                    resolved_at_tick=resolved_at_tick,
                    resolved_choice_id=resolved_choice_id,
                    was_auto_resolved=was_auto_resolved,
                    choices_json=json.dumps(dilemma["choices"]),
                )
            )
            db.commit()
        finally:
            db.close()

    def _persist_engineer(self, eng: Dict[str, Any], db: Optional[Any] = None) -> None:
        """UPSERT A SINGLE ENGINEER ROW IMMEDIATELY, USED FOR HIRING, SHIFT ROTATION AND STRESS
        CHANGES THAT SHOULD SURVIVE A RESTART.

        Pass an existing db session to fold this write into a caller's own shared transaction
        (e.g. a wrong triage guess's incident update + the assigned engineer's stress update,
        committed together as one logical unit -- see submit_triage) instead of opening/
        committing/closing its own."""
        owns_session = db is None
        if owns_session:
            self._db_write_lock.acquire()
            db = SessionLocal()
        try:
            db.merge(Engineer(**self._engineer_kwargs(eng)))
            if owns_session:
                db.commit()
        finally:
            if owns_session:
                db.close()
                self._db_write_lock.release()

    def _load_career_progress(self):
        """REHYDRATE ACHIEVEMENTS, COSMETICS AND PRESTIGE FOR THIS PLAYER FROM PRIOR RUNS"""
        db = SessionLocal()
        try:
            achievement_rows = db.query(Achievement).filter(Achievement.player_id == self.player_id).all()
            cosmetic_rows = db.query(UnlockedCosmetic).filter(UnlockedCosmetic.player_id == self.player_id).all()
        finally:
            db.close()

        self.achievements_unlocked = {row.achievement_key for row in achievement_rows}
        self.unlocked_cosmetics = {row.cosmetic_id for row in cosmetic_rows}

        earned = sum(
            entry["prestige_points"] for entry in achievements.ACHIEVEMENT_CATALOG if entry["id"] in self.achievements_unlocked
        )
        spent = sum(
            entry["prestige_cost"] for entry in cosmetics.COSMETIC_CATALOG if entry["id"] in self.unlocked_cosmetics
        )
        self.prestige_points = max(0, earned - spent)

    def _persist_career_record(self, outcome: str, scenario_outcome: Optional[Dict[str, Any]] = None):
        """WRITE A PERMANENT HALL-OF-FAME ENTRY FOR THIS CONCLUDED RUN, CONSOLIDATING THE FULL
        FINAL PICTURE (RESULT, OBJECTIVES, METRICS, INCIDENTS, CASH, SLA, DEBT, REPUTATION) SO IT
        SURVIVES FOR POST-INCIDENT/HISTORICAL REVIEW EVEN AFTER THE NEXT reset() WIPES THE LIVE
        SESSION. THE SOLE CALLER IS _evaluate_session_status, THE SOLE AUTHORITY FOR DECIDING A
        RUN HAS ENDED -- SEE ITS DOCSTRING.

        incidents_total/incidents_resolved ARE DERIVED BY COUNTING THIS SESSION'S ALREADY-
        PERSISTED incidents ROWS RIGHT NOW, RATHER THAN TRUSTING A SEPARATE IN-MEMORY COUNTER THAT
        COULD DRIFT -- THE SAME "COUNT FROM WHAT'S ACTUALLY PERSISTED" PHILOSOPHY THE RESTORE PATH
        ALREADY USES TO RECONSTRUCT _resolved_incident_count AFTER A RESTART."""
        db = SessionLocal()
        try:
            incidents_total = db.query(Incident).filter(Incident.session_id == self.session_id).count()
            incidents_resolved = (
                db.query(Incident)
                .filter(Incident.session_id == self.session_id, Incident.status == "resolved")
                .count()
            )
            objectives = self.active_scenario.objectives() if self.active_scenario else []
            db.add(
                CareerRecord(
                    id=f"career-{uuid.uuid4().hex[:8]}",
                    player_id=self.player_id,
                    scenario_id=self.active_scenario.scenario_id if self.active_scenario else None,
                    difficulty=self.difficulty,
                    outcome=outcome,
                    days_survived=self.current_tick // 24,
                    final_sla_percentage=round(self.sla_percentage, 2),
                    final_budget=round(self.budget, 2),
                    final_tech_debt=self.tech_debt,
                    final_reputation=round(self.reputation, 2),
                    incidents_total=incidents_total,
                    incidents_resolved=incidents_resolved,
                    prestige_earned=self.prestige_points,
                    recovered_from_snapshot=self._recovered_from_snapshot,
                    scenario_outcome_json=json.dumps(scenario_outcome) if scenario_outcome else None,
                    objectives_json=json.dumps(objectives) if objectives else None,
                )
            )
            db.commit()
        finally:
            db.close()

    def _persist_infrastructure_node(self, node: Dict[str, Any]):
        """RECORD A PLACED INFRASTRUCTURE NODE AS A NEW LEDGER ROW"""
        db = SessionLocal()
        try:
            db.add(
                InfrastructureNode(
                    id=node["id"],
                    session_id=self.session_id,
                    node_type=node["node_type"],
                    grid_x=node["grid_x"],
                    grid_y=node["grid_y"],
                    status=node["status"],
                    config_json=node["config_json"],
                )
            )
            db.commit()
        finally:
            db.close()

    def _delete_infrastructure_node(self, node_id: str):
        """PERMANENTLY REMOVE A PLACED INFRASTRUCTURE NODE ROW"""
        db = SessionLocal()
        try:
            existing = db.get(InfrastructureNode, node_id)
            if existing:
                db.delete(existing)
                db.commit()
        finally:
            db.close()

    def _persist_achievement(self, achievement_id: str):
        """RECORD AN UNLOCKED ACHIEVEMENT AS A NEW LEDGER ROW"""
        db = SessionLocal()
        try:
            db.add(
                Achievement(
                    id=f"ach-{uuid.uuid4().hex[:8]}",
                    session_id=self.session_id,
                    player_id=self.player_id,
                    achievement_key=achievement_id,
                    unlocked_at_tick=self.current_tick,
                )
            )
            db.commit()
        finally:
            db.close()

    def _persist_cosmetic_unlock(self, cosmetic_id: str):
        """RECORD AN UNLOCKED COSMETIC PROP AS A NEW LEDGER ROW"""
        db = SessionLocal()
        try:
            db.add(
                UnlockedCosmetic(
                    id=f"cos-{uuid.uuid4().hex[:8]}",
                    session_id=self.session_id,
                    player_id=self.player_id,
                    cosmetic_id=cosmetic_id,
                    unlocked_at_tick=self.current_tick,
                )
            )
            db.commit()
        finally:
            db.close()

    # --- websocket transport ----------------------------------------------

    async def connect_client(self, websocket: WebSocket):
        """REGISTER ACTIVE WEBSOCKET CLIENT"""
        await websocket.accept()
        self.active_websockets.add(websocket)
        # emit initial state snapshot immediately
        await websocket.send_text(json.dumps(self.get_state_payload()))

    def disconnect_client(self, websocket: WebSocket):
        """DEREGISTER WEBSOCKET CLIENT ON TERMINATION"""
        self.active_websockets.discard(websocket)

    async def _broadcast_json(self, payload: Dict[str, Any]):
        """FAN OUT AN ARBITRARY JSON PAYLOAD TO EVERY CONNECTED WEBSOCKET CLIENT"""
        if not self.active_websockets:
            return
        message = json.dumps(payload)
        stale_clients = set()
        for client in self.active_websockets:
            try:
                await client.send_text(message)
            except Exception:
                # capture disconnected sockets during broadcast
                stale_clients.add(client)
        for client in stale_clients:
            self.active_websockets.discard(client)

    async def broadcast_state(self):
        """BROADCAST CURRENT TELEMETRY STATE TO ALL SUBSCRIBED CLIENTS"""
        if not self.active_websockets:
            # nothing to serialize for: keeps the push-after-command path free with zero clients
            return
        await self._broadcast_json(self.get_state_payload())

    async def flush_pending_broadcasts(self):
        """SEND ANY OUT-OF-BAND EVENT FRAMES QUEUED SINCE THE LAST FLUSH (TICK OR COMMAND)"""
        queued, self._pending_broadcasts = self._pending_broadcasts, []
        for payload in queued:
            await self._broadcast_json(payload)

    @staticmethod
    def public_incident(inc: Dict[str, Any]) -> Dict[str, Any]:
        """THE WIRE-SAFE VIEW OF ONE INCIDENT: NO ANSWER KEY (log_lines, root_cause_line_id), AND THE
        ROOT CAUSE NARRATIVE WITHHELD UNTIL ITS INVESTIGATION IS SOLVED"""
        entry = {k: v for k, v in inc.items() if k not in ("log_lines", "root_cause_line_id")}
        if not inc["triage_solved"]:
            entry["root_cause"] = None
        return entry

    def public_incidents(self) -> List[Dict[str, Any]]:
        """STRIP THE TRIAGE ANSWER KEY (log_lines, root_cause_line_id) BEFORE ANY WIRE SERIALIZATION,
        AND WITHHOLD THE ROOT CAUSE NARRATIVE ITSELF UNTIL THE INCIDENT'S INVESTIGATION IS SOLVED --
        PREVIOUSLY THE REAL TEXT WAS ALWAYS SENT AND ONLY THE FRONTEND CHOSE NOT TO DISPLAY IT YET"""
        return [self.public_incident(inc) for inc in self.incidents]

    def get_state_payload(self) -> Dict[str, Any]:
        """COMPOSE SERIALIZABLE STATE PAYLOAD"""
        return {
            "type": "TICK_BROADCAST",
            "session_id": self.session_id,
            "tick": self.current_tick,
            "budget": round(self.budget, 2),
            "sla_percentage": round(self.sla_percentage, 2),
            "tech_debt": self.tech_debt,
            "user_happiness": round(self.user_happiness, 1),
            "status": self.status,
            "is_running": self.is_running,
            "tick_rate_seconds": self.tick_rate_seconds,
            "services": self.services,
            "active_incidents": self.public_incidents(),
            "recent_audits": self.audit_logs[-15:],
            "purchased_upgrades": sorted(self.purchased_upgrade_ids),
            "mitigation_cooldowns": dict(self.mitigation_last_fired_tick),
            "error_budget_remaining_ratio": round(self.error_budget_remaining_ratio, 4),
            "feature_freeze_active": self.feature_freeze_active,
            "engineers": self.engineers,
            "infrastructure_nodes": self.infrastructure_nodes,
            "achievements_unlocked": sorted(self.achievements_unlocked),
            "prestige_points": self.prestige_points,
            "unlocked_cosmetics": sorted(self.unlocked_cosmetics),
            "difficulty": self.difficulty,
            "reputation": round(self.reputation, 1),
            "active_scenario": (
                {
                    "scenario_id": self.active_scenario.scenario_id,
                    "elapsed_ticks": self.active_scenario.elapsed_ticks,
                    "duration_ticks": self.active_scenario.duration_ticks,
                    "completed": self.active_scenario.completed,
                    "outcome": self.active_scenario.outcome,
                    # same recomputed-from-live-state objectives /api/scenarios/active serves, incl. "failed"
                    "objectives": self.active_scenario.objectives(),
                }
                if self.active_scenario
                else None
            ),
        }

    # --- lifecycle ----------------------------------------------------------

    def start(self):
        """START SIMULATION TICK ASYNC TASK"""
        if self.status in ("bankrupted", "victory"):
            # terminal states require an explicit reset before resuming
            return
        if not self.is_running:
            self.is_running = True
            self._loop_task = asyncio.create_task(self._run_loop())

    def pause(self):
        """PAUSE SIMULATION TICK LOOP"""
        self.is_running = False
        if self._loop_task and not self._loop_task.done():
            self._loop_task.cancel()

    def set_speed(self, multiplier: float):
        """ADJUST TICK INTERVAL VELOCITY"""
        if multiplier <= 0:
            self.pause()
            return
        # base tick duration is 1 second
        self.tick_rate_seconds = 1.0 / multiplier
        if not self.is_running:
            self.start()

    def reset(self, scenario_id: Optional[str] = None, player_id: Optional[str] = None, difficulty: Optional[str] = None):
        """RESTART THE SIMULATION FROM A CLEAN STATE, OPTIONALLY INTO A SCRIPTED SCENARIO"""
        self.pause()
        if player_id and player_id != self.player_id:
            self.player_id = player_id
            self._load_career_progress()
        self.difficulty = difficulty if difficulty in DIFFICULTY_PRESETS else DEFAULT_DIFFICULTY
        self._difficulty_hazard_multiplier = DIFFICULTY_PRESETS[self.difficulty]["hazard_multiplier"]
        self.status = "running"
        self.current_tick = 0
        self.budget = DIFFICULTY_PRESETS[self.difficulty]["starting_budget"]
        self.tech_debt = 25
        self.user_happiness = 96.0
        self.sla_percentage = 100.0
        self._sla_window = deque(maxlen=VICTORY_TICK_THRESHOLD)
        self.financial_ledger = []
        self.quiet_ticks = 0
        self.reputation = 50.0
        self.services = self._init_default_services()
        self.incidents = []
        self.audit_logs = []

        self.purchased_upgrade_ids = set()
        self.pending_pre_alerts = []
        self.mitigation_last_fired_tick = {}

        self._error_budget_history = []
        self.error_budget_remaining_ratio = 1.0
        self.error_budget_burn_rate = 0.0
        self.feature_freeze_active = False

        self.next_dilemma_tick = random.randint(
            formulas.CAB_DILEMMA_MIN_INTERVAL_TICKS, formulas.CAB_DILEMMA_MAX_INTERVAL_TICKS
        )
        self.active_dilemma = None
        self._temporary_hazard_effects = []

        self.engineers = []

        self.active_scenario = None
        self._scenario_hazard_multiplier = 1.0
        if scenario_id:
            # scenario_id is already validated against SCENARIO_REGISTRY at the request-schema
            # layer (SessionResetRequest.scenario_id) before this method is ever called, so
            # scenario_cls is never None here in practice -- the guard stays as defense in depth
            scenario_cls = SCENARIO_REGISTRY.get(scenario_id)
            if scenario_cls:
                self.active_scenario = scenario_cls(self)
                self.active_scenario.on_start()

        self.infrastructure_nodes = []

        # achievements, prestige and cosmetics are permanent career progress: a new game does not
        # touch them, only _load_career_progress() (on player_id change) reloads them from disk
        self._resolved_incident_count = 0
        self._night_shift_ack_seen = False
        self._first_response_seen = False
        self._load_career_progress()

        self._pending_broadcasts = []
        self._recovered_from_snapshot = False

        self._persist_bootstrap()
        self.start()

    async def _run_loop(self):
        """PRIMARY TICK ADVANCEMENT AND STATE PROPAGATION LOOP"""
        try:
            while self.is_running:
                await asyncio.sleep(self.tick_rate_seconds)
                self.current_tick += 1
                self._update_simulation_tick()
                # kwargs are materialized here, synchronously, on the main thread -- only the
                # resulting plain-value copies (never self.services/self.incidents/self.engineers
                # themselves) are handed to the background thread, so a concurrent request handler
                # mutating those live dicts on the main thread can't race the DB write (see
                # _build_snapshot_kwargs/_persist_snapshot_data)
                await asyncio.to_thread(self._persist_snapshot_data, *self._build_snapshot_kwargs())
                await self.broadcast_state()
                await self.flush_pending_broadcasts()
        except asyncio.CancelledError:
            # handle cooperative task cancellation on pause
            pass

    # --- tick evolution -------------------------------------------------

    def _update_simulation_tick(self):
        """EXECUTE SYSTEMIC DEGRADATION, BURN RATES, INCIDENT PENALTIES AND CASCADE RISK"""
        instant_sla = formulas.instant_sla_percentage(self.services)
        self._sla_window.append(instant_sla)
        self.sla_percentage = formulas.clamp_percentage(sum(self._sla_window) / len(self._sla_window))
        self._update_error_budget_tracking()

        self._apply_budget_burn()
        self._apply_happiness_drift()
        self._progress_incidents()
        self._apply_quiet_period_refactor()
        self._evaluate_random_failures()

        # advance the active scenario's own clock/mechanics before the centralized end-of-run
        # check below, so its evaluate_victory() (folded into _evaluate_session_status -- the
        # sole authority for deciding a run has ended, see its docstring) sees this tick's
        # fully-updated state
        if self.active_scenario and not self.active_scenario.completed:
            self.active_scenario.elapsed_ticks += 1
            self.active_scenario.on_tick()

        self._evaluate_session_status()
        if not self.is_running:
            # the run just ended this tick (bankruptcy, a scenario's own conclusion, or the core
            # survival victory) -- every mechanic below assumes an ongoing game, so nothing
            # further happens on this terminal tick, except unlocking whatever the final state earned
            # (idempotent: the terminal branches already evaluated it before writing the career record)
            self._evaluate_achievements()
            return

        self._evaluate_feature_freeze()
        self._progress_staff_fatigue()
        self._progress_pre_alerts()
        self._evaluate_cab_dilemma()
        self._evaluate_achievements()

    # --- financial ledger ----------------------------------------------
    #
    # every category of cash movement in the game (passive operating burn, per-incident surcharge,
    # regulatory fines, hiring, upgrades, mitigations, infrastructure, dilemma outcomes, ai auditor
    # adjustments) flows through this single method: it is the only place self.budget is mutated
    # anywhere in the engine, so the amount deducted, the amount shown in the audit log and the
    # amount recorded in the ledger can never drift apart (they're literally the same value).

    def _apply_financial_event(
        self,
        category: str,
        amount: float,
        reference: Optional[str] = None,
        audit_event_type: Optional[str] = None,
        audit_details: Optional[Dict[str, Any]] = None,
        actor: str = "VP_OF_INFRA",
        compliance_flag: bool = True,
        db: Optional[Any] = None,
    ) -> float:
        """APPLY A SIGNED CASH MOVEMENT (POSITIVE = INCOME/CREDIT, NEGATIVE = EXPENSE/COST/FINE),
        RECORD IT IN THE BOUNDED IN-MEMORY financial_ledger, AND OPTIONALLY MIRROR IT INTO THE
        GOVERNANCE AUDIT TRAIL (audit_event_type). Passing no audit_event_type is intentional for
        the routine per-tick categories (operational_expense/incident_surcharge): those still get
        a ledger entry for traceability, but skip _log_audit_event's synchronous per-call db write,
        which would otherwise fire every single tick instead of only on discrete player/board
        actions. Returns the resulting balance.

        Pass an existing db session to fold the audit-log write and session-scalars write below
        into a caller's own shared transaction (e.g. apply_mitigation, which also needs the
        resolved incident row committed together with this same financial event as one logical
        unit) instead of each opening/committing/closing its own -- the caller then owns the
        commit and holds self._db_write_lock for the whole unit of work."""
        self.budget = max(0.0, self.budget + amount)
        self.financial_ledger.append(
            {
                "id": f"txn-{uuid.uuid4().hex[:8]}",
                "tick": self.current_tick,
                "category": category,
                "amount": round(amount, 2),
                "reference": reference,
                "balance_after": round(self.budget, 2),
            }
        )
        if len(self.financial_ledger) > FINANCIAL_LEDGER_MAX_ENTRIES:
            self.financial_ledger.pop(0)
        if audit_event_type:
            details = {**(audit_details or {}), "amount": round(amount, 2), "balance_after": round(self.budget, 2)}
            self._log_audit_event(
                event_type=audit_event_type, actor=actor, details=details, compliance_flag=compliance_flag, db=db
            )
            # every discrete, audited financial action also durably persists the session row
            # right now -- not just on the next tick -- so a crash while the game is paused (e.g.
            # mid-onboarding) can never lose an already-applied action's session-level effect
            self._persist_session_scalars(db=db)
        return self.budget

    def _apply_budget_burn(self):
        """DEDUCT PASSIVE OPERATING BURN AND PER-INCIDENT SURCHARGES AS SEPARATE, CATEGORIZED
        LEDGER ENTRIES -- SPECIALIST-COVERAGE-ADJUSTED"""
        base_burn = formulas.effective_passive_burn(self.user_happiness)
        if base_burn > 0:
            self._apply_financial_event(category="operational_expense", amount=-base_burn)
        for inc in self.incidents:
            if inc["status"] not in ("active", "acknowledged"):
                continue
            assigned = self._engineer_for_service(inc["service_id"])
            quality = formulas.specialist_quality(assigned, staff.SERVICE_COMPETENCY_MAP, inc["service_id"])
            effective_mttr = inc["mttr_seconds"] * formulas.specialist_burn_multiplier(quality)
            surcharge = formulas.incident_surcharge(inc["severity"], effective_mttr)
            self._apply_financial_event(category="incident_surcharge", amount=-surcharge, reference=inc["id"])
            # the real, running total actually charged against this specific incident -- read
            # back verbatim by the postmortem pipeline instead of being reconstructed later
            inc["accrued_surcharge"] = inc.get("accrued_surcharge", 0.0) + surcharge

    def _apply_happiness_drift(self):
        """DRIFT USER HAPPINESS BASED ON OUTAGE SEVERITY AND ALERT FATIGUE"""
        dampener = 0.75 if "espresso_machine" in self.purchased_upgrade_ids else 1.0
        any_down_or_degraded = any(s["status"] != "healthy" for s in self.services)
        self.user_happiness = formulas.happiness_after_outage_drift(self.user_happiness, any_down_or_degraded, dampener)

        for inc in self.incidents:
            if inc["status"] == "active":
                penalty = formulas.alert_fatigue_penalty(inc["mtta_seconds"])
                if penalty > 0:
                    self.user_happiness = formulas.happiness_after_alert_fatigue(self.user_happiness, penalty, dampener)

    def _progress_incidents(self):
        """ADVANCE MTTA/MTTR COUNTERS AND APPLY REGULATORY BREACH SANCTIONS"""
        for inc in self.incidents:
            if inc["status"] in ("active", "acknowledged"):
                inc["mttr_seconds"] += 1
                if inc["status"] == "active":
                    inc["mtta_seconds"] += 1
                    effective_mtta = inc["mtta_seconds"]
                    if "apm_tracing" in self.purchased_upgrade_ids:
                        effective_mtta = max(0, effective_mtta - 2)
                    assigned = self._engineer_for_service(inc["service_id"])
                    quality = formulas.specialist_quality(assigned, staff.SERVICE_COMPETENCY_MAP, inc["service_id"])
                    if quality >= 0.7:
                        effective_mtta = max(0, effective_mtta - 1)
                    if formulas.is_unattended_breach(effective_mtta):
                        # "fine_amount" kept alongside the generic "amount" _apply_financial_event
                        # injects: the frontend's floating-text feedback already reads this exact
                        # key from the audit payload
                        self._apply_financial_event(
                            category="regulatory_fine",
                            amount=-formulas.UNATTENDED_BREACH_FINE,
                            reference=inc["id"],
                            audit_event_type="UNATTENDED_ALERT_VIOLATION",
                            audit_details={"incident_id": inc["id"], "fine_amount": formulas.UNATTENDED_BREACH_FINE},
                            actor="AUDIT_SYSTEM",
                            compliance_flag=False,
                        )

    def _apply_quiet_period_refactor(self):
        """GRANT AMBIENT TECHNICAL DEBT RELIEF DURING SUSTAINED QUIET PERIODS"""
        if self.incidents:
            self.quiet_ticks = 0
            return
        self.quiet_ticks += 1
        if self.quiet_ticks % QUIET_REFACTOR_INTERVAL_TICKS == 0 and self.tech_debt > 0:
            self.tech_debt = formulas.clamp_tech_debt(self.tech_debt - QUIET_REFACTOR_TDI_RELIEF)
            self._log_audit_event(
                event_type="PROACTIVE_REFACTOR_CYCLE",
                actor="PLATFORM_TEAM",
                details={"tech_debt_after": self.tech_debt},
                compliance_flag=True,
            )

    def _infrastructure_nodes_for(self, service_id: str, node_type: str) -> List[Dict[str, Any]]:
        """LIST PLACED INFRASTRUCTURE NODES OF A GIVEN TYPE TARGETING A SERVICE"""
        return [
            n for n in self.infrastructure_nodes
            if n["node_type"] == node_type and json.loads(n["config_json"]).get("target_service_id") == service_id
        ]

    def _active_temporary_hazard_multiplier(self) -> float:
        """PRUNE EXPIRED DECISION-CAUSED HAZARD WINDOWS (E.G. A CORNER-CUTTING DILEMMA CHOICE)
        AND RETURN THE COMBINED MULTIPLIER STILL IN EFFECT"""
        self._temporary_hazard_effects = [
            e for e in self._temporary_hazard_effects if e["expires_at_tick"] > self.current_tick
        ]
        multiplier = 1.0
        for effect in self._temporary_hazard_effects:
            multiplier *= effect["multiplier"]
        return multiplier

    def _evaluate_random_failures(self):
        """TRIGGER SPONTANEOUS OUTAGES BASED ON TECH DEBT AND TOPOLOGY"""
        if len(self.incidents) >= MAX_CONCURRENT_INCIDENTS:
            # throttle simultaneous active alarms to prevent unplayable overwhelm
            return
        temporary_hazard_multiplier = self._active_temporary_hazard_multiplier()
        for srv in self.services:
            if srv["status"] != "healthy":
                continue
            dep_statuses_by_id = {
                dep_id: dep["status"]
                for dep_id in srv["dependencies"]
                for dep in self.services
                if dep["id"] == dep_id
            }
            # kafka queues fully decouple the named producer's status from this consumer's hazard calc
            decoupled_ids = {
                json.loads(n["config_json"])["producer_service_id"]
                for n in self._infrastructure_nodes_for(srv["id"], "kafka_queue")
            }
            dep_statuses = formulas.apply_queue_decoupling(dep_statuses_by_id, decoupled_ids)

            failure_probability = formulas.cascading_failure_probability(self.tech_debt, dep_statuses)
            # services with more downstream dependents are more exposed to the same tech debt --
            # the same global debt level is not felt evenly across the topology
            failure_probability *= formulas.tech_debt_exposure_multiplier(
                formulas.dependents_count(srv["id"], self.services)
            )
            # a competency-matched, on-duty, low-stress engineer catches trouble early
            failure_probability *= formulas.specialist_hazard_discount(
                formulas.specialist_quality(self._engineer_for_service(srv["id"]), staff.SERVICE_COMPETENCY_MAP, srv["id"])
            )
            failure_probability *= temporary_hazard_multiplier
            if "multi_az_clusters" in self.purchased_upgrade_ids:
                failure_probability *= 0.60
            if self._infrastructure_nodes_for(srv["id"], "db_read_replica"):
                failure_probability *= infrastructure.DB_READ_REPLICA_HAZARD_MULTIPLIER
            if self._infrastructure_nodes_for(srv["id"], "nginx_lb"):
                failure_probability *= infrastructure.NGINX_LB_HAZARD_MULTIPLIER
            failure_probability *= getattr(self, "_scenario_hazard_multiplier", 1.0)
            failure_probability *= getattr(self, "_difficulty_hazard_multiplier", 1.0)
            if self.reputation < REPUTATION_CRISIS_THRESHOLD:
                # the board is scrutinizing every incident; nervous, corner-cutting reactions
                # of a low-trust org make the next failure slightly more likely, not less
                failure_probability *= REPUTATION_CRISIS_HAZARD_MULTIPLIER
            elif self.reputation > REPUTATION_TRUSTED_THRESHOLD:
                # a track record of sound governance buys a small margin of goodwill/slack
                failure_probability *= REPUTATION_TRUSTED_HAZARD_MULTIPLIER
            # the only place this probability is capped -- after every multiplier above has been
            # folded in, never before (see cascading_failure_probability's docstring)
            failure_probability = formulas.clamp_probability(failure_probability)
            if random.random() < failure_probability:
                if "predictive_anomaly_detection" in self.purchased_upgrade_ids:
                    self._queue_pre_alert(srv)
                else:
                    self._trigger_service_failure(srv)

    def _trigger_service_failure(self, srv: Dict[str, Any], root_cause: Optional[str] = None) -> Dict[str, Any]:
        """DEGRADE OR COLLAPSE A SERVICE AND RAISE INCIDENT (root_cause PINS THE NARRATIVE, E.G. FOR THE TUTORIAL)"""
        incident = build_incident(srv, self.current_tick, root_cause=root_cause)
        # frozen at the moment the incident actually happened -- the postmortem pipeline reads
        # this instead of the session's *current* tech_debt so a report generated much later still
        # reflects the truth of what the debt level was when this incident was created
        incident["tech_debt_at_creation"] = self.tech_debt
        incident["tech_debt_at_resolution"] = None
        incident["accrued_surcharge"] = 0.0
        srv["status"] = "down" if incident["severity"] == "P1_CRITICAL" else "degraded"
        srv["latency_ms"] = random.randint(850, 2400)
        if self._infrastructure_nodes_for(srv["id"], "redis_cache"):
            srv["latency_ms"] = int(srv["latency_ms"] * infrastructure.REDIS_LATENCY_DAMPENER)
        srv["error_rate"] = round(random.uniform(0.15, 0.85), 4)

        self.incidents.append(incident)
        # persisted immediately (not just on the next periodic snapshot) so a crash in the
        # narrow window right after spawn can never lose the incident (and its log stream/answer
        # key) entirely. the incident row and its INCIDENT_RAISED audit event are one logical
        # fact ("this incident happened") -- committed together, under one lock hold, so a crash
        # between them can never leave one persisted without the other.
        with self._db_write_lock:
            db = SessionLocal()
            try:
                self._persist_incident(incident, db=db)
                self._log_audit_event(
                    event_type="INCIDENT_RAISED",
                    actor="AUTOMATED_MONITOR",
                    details={"service_id": srv["id"], "severity": incident["severity"], "incident_id": incident["id"]},
                    compliance_flag=True,
                    db=db,
                )
                db.commit()
            finally:
                db.close()
        return incident

    def _queue_pre_alert(self, srv: Dict[str, Any]):
        """DELAY A HAZARD ROLL'S MATERIALIZATION, BROADCASTING AN ADVANCE WARNING FIRST"""
        self.pending_pre_alerts.append({"service_id": srv["id"], "fire_at_tick": self.current_tick + PRE_ALERT_LEAD_TICKS})
        self._pending_broadcasts.append(
            {"type": "PRE_ALERT_WARNING", "service_id": srv["id"], "ticks_remaining": PRE_ALERT_LEAD_TICKS}
        )

    def _progress_pre_alerts(self):
        """MATERIALIZE QUEUED PRE-ALERTED FAILURES ONCE THEIR DELAY ELAPSES"""
        still_pending = []
        for entry in self.pending_pre_alerts:
            if self.current_tick >= entry["fire_at_tick"]:
                srv = next((s for s in self.services if s["id"] == entry["service_id"]), None)
                if srv and srv["status"] == "healthy":
                    self._trigger_service_failure(srv)
            else:
                still_pending.append(entry)
        self.pending_pre_alerts = still_pending

    def _evaluate_session_status(self):
        """THE SOLE AUTHORITY FOR DECIDING A RUN HAS ENDED -- BANKRUPTCY, AN ACTIVE SCRIPTED/
        CUSTOM SCENARIO'S OWN WIN/LOSS CONDITION, OR THE CORE MONTHLY-SLA SURVIVAL VICTORY -- OR
        IS IN A NON-TERMINAL WARNING STATE (SLA BREACH). EVERY TERMINAL TRANSITION SETS
        self.status, self.is_running=False AND PERSISTS EXACTLY ONE CareerRecord RIGHT HERE; NO
        OTHER METHOD IS ALLOWED TO DO ANY OF THOSE THREE THINGS. PREVIOUSLY, A SCRIPTED SCENARIO'S
        OWN CONCLUSION WAS DECIDED BY A SEPARATE, UNCOORDINATED CHECK INSIDE
        _update_simulation_tick THAT NEVER TOUCHED self.status/is_running AND NEVER PERSISTED A
        CareerRecord -- THE TWO COULD DISAGREE ON THE SAME TICK (E.G. BANKRUPTCY FIRING WHILE A
        SCENARIO SIMULTANEOUSLY LOGGED "compliant: True") AND ONLY ONE OF THEM WAS EVER RECORDED.
        THE THREE BRANCHES BELOW ARE EVALUATED IN A FIXED, DELIBERATE PRIORITY ORDER SO EXACTLY
        ONE OF THEM CAN EVER DECIDE THIS TICK'S OUTCOME."""
        # 1. bankruptcy is a hard stop regardless of an active scenario -- running out of money
        # ends the run even mid-scenario
        if self.budget <= 0.0:
            self.budget = 0.0
            if self.status != "bankrupted":
                self.status = "bankrupted"
                self._log_audit_event(
                    event_type="BANKRUPTCY_LIQUIDATION",
                    actor="BOARD_OF_DIRECTORS",
                    details={"final_tick": self.current_tick},
                    compliance_flag=False,
                )
                # before the record, so its prestige_earned already counts whatever this final tick unlocks
                self._evaluate_achievements()
                self._persist_career_record(outcome="bankrupted", scenario_outcome=None)
            self.is_running = False
            return

        # 2. an active scenario's own condition is authoritative over the generic survival
        # victory while one is running -- checked next so e.g. ransomware's "master db
        # compromised" defeat can never be silently overridden by "you also survived 720 ticks"
        # happening to be true on the same tick, and vice versa
        if self.active_scenario and not self.active_scenario.completed:
            outcome = self.active_scenario.evaluate_victory()
            if outcome is not None:
                self.active_scenario.completed = True
                self.active_scenario.outcome = outcome
                compliant = bool(outcome.get("compliant", True))
                self._log_audit_event(
                    event_type="SCENARIO_CONCLUDED",
                    actor="AUDIT_SYSTEM",
                    details=outcome,
                    compliance_flag=compliant,
                )
                # reuses the existing terminal status values the frontend already renders a
                # screen for ("victory"/"bankrupted") rather than introducing a third value
                # nothing in the UI handles; the scenario's own precise outcome (distinct from an
                # actual monetary bankruptcy) is preserved in full in the persisted CareerRecord
                # (see _persist_career_record) even though this live status field is coarser
                self.status = "victory" if compliant else "bankrupted"
                # the terminal tick is where the run-defining achievements (SOC-2, chaos survivor,
                # ransomware repelled) become true; evaluated before the record so prestige_earned counts them
                self._evaluate_achievements()
                self._persist_career_record(
                    outcome="victory" if compliant else "scenario_defeat",
                    scenario_outcome=outcome,
                )
                self.is_running = False
                return

        # 3. the generic "survive one full month of ordinary operations" victory only applies to
        # the sandbox game (no scripted/custom scenario active) -- a scenario's own
        # evaluate_victory() is already the sole authority for its own run (branch 2 above), so
        # this must never also fire independently and override/race it for a scenario whose own
        # duration_ticks exceeds this threshold (e.g. a long custom scenario)
        if (
            self.active_scenario is None
            and self.current_tick >= VICTORY_TICK_THRESHOLD
            and self.sla_percentage >= formulas.SLA_BREACH_THRESHOLD
        ):
            if self.status != "victory":
                self.status = "victory"
                self._log_audit_event(
                    event_type="MONTHLY_AUDIT_CYCLE_SURVIVED",
                    actor="AUDIT_SYSTEM",
                    details={"sla_percentage": round(self.sla_percentage, 2)},
                    compliance_flag=True,
                )
                self._evaluate_achievements()
                self._persist_career_record(outcome="victory", scenario_outcome=None)
            self.is_running = False
            return

        # 4. non-terminal warning state, orthogonal to the terminal decisions above -- applies
        # regardless of an active scenario
        if self.current_tick > BREACH_GRACE_TICKS and self.sla_percentage < formulas.SLA_BREACH_THRESHOLD:
            if self.status != "breached":
                self.status = "breached"
                self._log_audit_event(
                    event_type="SLA_BREACH_EMERGENCY_SANCTION",
                    actor="AUDIT_SYSTEM",
                    details={"sla_percentage": round(self.sla_percentage, 2)},
                    compliance_flag=False,
                )
        elif self.status == "breached" and self.sla_percentage >= formulas.SLA_BREACH_THRESHOLD:
            self.status = "running"

    # --- error budget governance ------------------------------------------

    def _update_error_budget_tracking(self):
        """SAMPLE CUMULATIVE ERROR BUDGET BURN AND DERIVE A ROLLING BURN RATE.

        error_budget_remaining_ratio is deliberately its own state, distinct from sla_percentage
        (the availability metric it's derived from) and from `status == "breached"` (a different
        threshold governing a different consequence -- see TOTAL_ERROR_BUDGET_PCT's docstring)."""
        burn_ratio = formulas.error_budget_burn_ratio(self.sla_percentage)
        self._error_budget_history.append(burn_ratio)
        if len(self._error_budget_history) > ERROR_BUDGET_BURN_RATE_WINDOW:
            self._error_budget_history.pop(0)
        self.error_budget_burn_rate = formulas.error_budget_burn_rate(self._error_budget_history)
        self.error_budget_remaining_ratio = formulas.error_budget_remaining_ratio(burn_ratio)

    def _evaluate_feature_freeze(self):
        """ENGAGE OR LIFT THE FEATURE FREEZE BASED ON ERROR BUDGET DEPLETION"""
        if self.error_budget_remaining_ratio <= 0.0 and not self.feature_freeze_active:
            self.feature_freeze_active = True
            self._log_audit_event(
                event_type="FEATURE_FREEZE_ENGAGED",
                actor="AUDIT_SYSTEM",
                details={"sla_percentage": round(self.sla_percentage, 2), "tech_debt": self.tech_debt},
                compliance_flag=False,
            )
        elif self.error_budget_remaining_ratio > 0.0 and self.feature_freeze_active:
            self.feature_freeze_active = False
            self._log_audit_event(
                event_type="FEATURE_FREEZE_LIFTED",
                actor="AUDIT_SYSTEM",
                details={"sla_percentage": round(self.sla_percentage, 2)},
                compliance_flag=True,
            )

    # --- cab dilemma engine -------------------------------------------------

    def _evaluate_cab_dilemma(self):
        """OFFER A NEW CAB DILEMMA ON SCHEDULE, OR AUTO-RESOLVE AN EXPIRED ONE"""
        if self.active_dilemma is not None:
            if self.current_tick >= self.active_dilemma["expires_at_tick"]:
                self._auto_resolve_dilemma()
            return
        if self.current_tick < self.next_dilemma_tick:
            return
        self.active_dilemma = dilemmas.build_dilemma(self.current_tick, self.reputation)
        self._persist_dilemma_event(self.active_dilemma, None, None, False)
        self._log_audit_event(
            event_type="DILEMMA_OFFERED",
            actor="BOARD_OF_DIRECTORS",
            details={"dilemma_id": self.active_dilemma["id"], "title": self.active_dilemma["title"]},
            compliance_flag=True,
        )
        self._pending_broadcasts.append(
            {
                "type": "DILEMMA_OFFERED",
                "dilemma_id": self.active_dilemma["id"],
                "title": self.active_dilemma["title"],
                "narrative": self.active_dilemma["narrative"],
                "choices": self.active_dilemma["choices"],
                "expires_at_tick": self.active_dilemma["expires_at_tick"],
            }
        )

    def _auto_resolve_dilemma(self):
        """FALL BACK TO THE DEFAULT CHOICE WHEN THE DECISION WINDOW EXPIRES UNANSWERED"""
        dilemma = self.active_dilemma
        choice = next(c for c in dilemma["choices"] if c["id"] == dilemma["default_choice_id"])
        self._apply_dilemma_choice(choice, auto_resolved=True)

    def resolve_dilemma(self, dilemma_id: str, choice_id: str) -> Dict[str, Any]:
        """APPLY THE PLAYER'S SELECTED CAB DILEMMA OUTCOME"""
        if not self.active_dilemma or self.active_dilemma["id"] != dilemma_id:
            return {"success": False, "error": "No matching active dilemma"}
        choice = next((c for c in self.active_dilemma["choices"] if c["id"] == choice_id), None)
        if not choice:
            return {"success": False, "error": "Unknown choice id"}
        self._apply_dilemma_choice(choice, auto_resolved=False)
        return {"success": True, "choice_id": choice_id, "budget": self.budget, "tech_debt": self.tech_debt}

    def _apply_dilemma_choice(self, choice: Dict[str, Any], auto_resolved: bool):
        """MUTATE SESSION STATE PER THE CHOSEN TRADE-OFF AND CLOSE OUT THE ACTIVE DILEMMA"""
        dilemma = self.active_dilemma
        self.tech_debt = formulas.clamp_tech_debt(self.tech_debt + choice["tech_debt_delta"])
        self.user_happiness = formulas.clamp_percentage(self.user_happiness + choice["happiness_delta"])
        self.reputation = formulas.clamp_percentage(self.reputation + choice.get("reputation_delta", 0))
        self._persist_dilemma_event(dilemma, choice["id"], self.current_tick, auto_resolved)

        # a corner-cutting choice can carry a temporary elevated hazard window -- a decision now
        # visibly influencing failure risk later, not just which dilemmas get offered next. This
        # mutates _temporary_hazard_effects *before* the financial event below, so the session
        # snapshot that call triggers already captures the freshly-opened window.
        risk_window_ticks = choice.get("risk_window_ticks")
        if risk_window_ticks:
            self._temporary_hazard_effects.append(
                {
                    "multiplier": choice["risk_multiplier"],
                    "expires_at_tick": self.current_tick + risk_window_ticks,
                    "source": f"dilemma:{dilemma.get('dilemma_key', dilemma['id'])}:{choice['id']}",
                }
            )
            self._log_audit_event(
                event_type="ELEVATED_RISK_WINDOW_OPENED",
                actor="AUDIT_SYSTEM",
                details={
                    "dilemma_id": dilemma["id"],
                    "choice_id": choice["id"],
                    "hazard_multiplier": choice["risk_multiplier"],
                    "expires_at_tick": self.current_tick + risk_window_ticks,
                },
                compliance_flag=False,
            )

        self._apply_financial_event(
            category="dilemma_outcome",
            amount=choice["budget_delta"],
            reference=dilemma["id"],
            audit_event_type="DILEMMA_RESOLVED",
            audit_details={
                "dilemma_id": dilemma["id"],
                "choice_id": choice["id"],
                "auto_resolved": auto_resolved,
                "budget_delta": choice["budget_delta"],
                "tech_debt_delta": choice["tech_debt_delta"],
                "tech_debt_after": self.tech_debt,
                "happiness_delta": choice["happiness_delta"],
                "reputation_delta": choice.get("reputation_delta", 0),
                "reputation_after": round(self.reputation, 1),
            },
            actor="BOARD_OF_DIRECTORS" if auto_resolved else "VP_OF_INFRA",
            compliance_flag=choice["tech_debt_delta"] <= 5,
        )

        self.active_dilemma = None
        self.next_dilemma_tick = self.current_tick + random.randint(
            formulas.CAB_DILEMMA_MIN_INTERVAL_TICKS, formulas.CAB_DILEMMA_MAX_INTERVAL_TICKS
        )

    # --- staff on-call and fatigue ------------------------------------------

    def _engineer_for_service(self, service_id: str) -> Optional[Dict[str, Any]]:
        """LOOK UP THE ENGINEER CURRENTLY ASSIGNED TO A GIVEN SERVICE"""
        return next((e for e in self.engineers if e["assigned_service_id"] == service_id), None)

    def _progress_staff_fatigue(self):
        """ADVANCE PER-ENGINEER STRESS AND STAMINA EACH TICK BASED ON DUTY STATUS AND ALARM STATE"""
        for eng in self.engineers:
            if eng["on_call_status"] in ("off_duty", "resting"):
                eng["stress_index"] = formulas.clamp_percentage(eng["stress_index"] - formulas.OFF_DUTY_STRESS_RECOVERY_PER_TICK)
                eng["stamina"] = formulas.clamp_percentage(eng["stamina"] + formulas.OFF_DUTY_STAMINA_RECOVERY_PER_TICK)
                if eng["on_call_status"] == "resting":
                    # exactly one resting tick, then fully off duty
                    eng["on_call_status"] = "off_duty"
                continue
            eng["stamina"] = formulas.clamp_percentage(eng["stamina"] - formulas.ON_DUTY_STAMINA_DRAIN_PER_TICK)
            unacked = [
                inc for inc in self.incidents
                if inc["service_id"] == eng["assigned_service_id"] and inc["status"] == "active"
            ]
            matched = formulas.competency_match(eng, staff.SERVICE_COMPETENCY_MAP, eng["assigned_service_id"])
            for inc in unacked:
                gain = formulas.stress_gain_for_unacked_alarm(eng["stress_index"], inc["severity"])
                gain *= formulas.specialist_stress_gain_multiplier(matched)
                if "ergonomic_chairs" in self.purchased_upgrade_ids:
                    gain *= 0.80
                eng["stress_index"] = formulas.clamp_percentage(eng["stress_index"] + gain)

    def hire_engineer(self, core_competency: str, assigned_service_id: Optional[str]) -> Dict[str, Any]:
        """HIRE A NEW ENGINEER, DEDUCTING A FLAT SIGNING COST FROM RUNWAY BUDGET"""
        if self.budget < formulas.HIRING_COST:
            return {"success": False, "error": "Insufficient budget runway"}
        if core_competency not in staff.CORE_COMPETENCIES:
            return {"success": False, "error": "Unknown core competency"}
        # mirrors place_infrastructure_node's target_service_id check: a client-supplied service
        # id must resolve to a real service before it's accepted and paid for, rather than being
        # stored verbatim (an unassigned engineer, assigned_service_id=None, is still permitted)
        if assigned_service_id is not None and not any(s["id"] == assigned_service_id for s in self.services):
            return {"success": False, "error": "Assigned service not found"}
        engineer = staff.build_engineer(self.session_id, core_competency, assigned_service_id, self.current_tick)
        self.engineers.append(engineer)
        self._persist_engineer(engineer)
        self._apply_financial_event(
            category="hiring_cost",
            amount=-formulas.HIRING_COST,
            reference=engineer["id"],
            audit_event_type="ENGINEER_HIRED",
            audit_details={"engineer_id": engineer["id"], "core_competency": core_competency, "cost": formulas.HIRING_COST},
        )
        return {"success": True, "engineer": engineer, "budget": self.budget}

    def rotate_shift(self, engineer_id: str) -> Dict[str, Any]:
        """TOGGLE AN ENGINEER BETWEEN ON-CALL AND RESTING STATUS"""
        eng = next((e for e in self.engineers if e["id"] == engineer_id), None)
        if not eng:
            return {"success": False, "error": "Engineer not found"}
        if eng["on_call_status"] == "on_duty":
            eng["on_call_status"] = "resting"
        else:
            if eng["stamina"] < 40:
                return {"success": False, "error": "Stamina too low to return to duty"}
            eng["on_call_status"] = "on_duty"
        self._persist_engineer(eng)
        self._log_audit_event(
            event_type="SHIFT_ROTATED",
            actor="VP_OF_INFRA",
            details={"engineer_id": engineer_id, "new_status": eng["on_call_status"]},
            compliance_flag=True,
        )
        return {"success": True, "engineer": eng}

    # --- player actions -------------------------------------------------

    def acknowledge_incident(self, incident_id: str) -> bool:
        """ACKNOWLEDGE AN ACTIVE INCIDENT"""
        for inc in self.incidents:
            if inc["id"] == incident_id and inc["status"] == "active":
                inc["status"] = "acknowledged"
                inc["acknowledged_tick"] = self.current_tick

                office_hour = self.current_tick % 24
                if office_hour >= 22 or office_hour < 5:
                    self._night_shift_ack_seen = True
                if inc["mtta_seconds"] <= 1:
                    self._first_response_seen = True

                # the incident row and its INCIDENT_ACKNOWLEDGED audit event are one logical fact
                # -- committed together, under one lock hold, so a crash between them can never
                # leave one persisted without the other
                with self._db_write_lock:
                    db = SessionLocal()
                    try:
                        self._persist_incident(inc, db=db)
                        self._log_audit_event(
                            event_type="INCIDENT_ACKNOWLEDGED",
                            actor="VP_OF_INFRA",
                            details={"incident_id": incident_id, "mtta_ticks": inc["mtta_seconds"]},
                            compliance_flag=True,
                            db=db,
                        )
                        db.commit()
                    finally:
                        db.close()
                return True
        return False

    def submit_triage(self, incident_id: str, line_id: str) -> Dict[str, Any]:
        """CHECK A PLAYER'S ROOT-CAUSE LOG-LINE GUESS AGAINST THE INCIDENT'S RECORDED ANSWER.

        Reward is always forward-looking (a discount/effectiveness bonus applied to a *future*
        mitigation, see apply_mitigation's triage_accuracy use) -- mtta_seconds/mttr_seconds, the
        historical record of what already happened, are never rewritten here."""
        inc = next((i for i in self.incidents if i["id"] == incident_id), None)
        if not inc:
            return {"success": False, "error": "Incident not found"}
        if inc["triage_solved"]:
            return {"success": True, "correct": True, "already_solved": True}
        # this is the very first triage attempt against this incident (before either a solve or a
        # wrong guess has been recorded) -- log it once as a real timeline fact so the postmortem
        # pipeline knows an investigation actually happened, rather than inferring one
        is_first_attempt = inc.get("triage_wrong_attempts", 0) == 0
        correct = line_id == inc["root_cause_line_id"]

        # everything below is the consequence of this one triage submission -- committed together,
        # under one lock hold, so a crash partway through can never leave e.g. the incident row
        # updated with no matching audit event, or the incident updated but the assigned
        # engineer's stress change lost
        with self._db_write_lock:
            db = SessionLocal()
            try:
                if is_first_attempt:
                    self._log_audit_event(
                        event_type="INVESTIGATION_STARTED",
                        actor="VP_OF_INFRA",
                        details={"incident_id": incident_id},
                        compliance_flag=True,
                        db=db,
                    )
                if correct:
                    wrong_attempts = inc.get("triage_wrong_attempts", 0)
                    accuracy = formulas.triage_accuracy(wrong_attempts)
                    inc["triage_solved"] = True
                    inc["triage_accuracy"] = accuracy
                    self._persist_incident(inc, db=db)
                    self._log_audit_event(
                        event_type="ROOT_CAUSE_IDENTIFIED",
                        actor="VP_OF_INFRA",
                        details={
                            "incident_id": incident_id,
                            "line_id": line_id,
                            "wrong_attempts": wrong_attempts,
                            "accuracy": round(accuracy, 2),
                        },
                        compliance_flag=True,
                        db=db,
                    )
                else:
                    # a wrong guess is not free: it erodes the eventual reward (via triage_accuracy
                    # above) and, if a specialist is actually assigned to the service, costs them a
                    # bit of stress for chasing a false lead -- makes "click every line" a losing
                    # strategy without capping attempts or introducing any randomness
                    inc["triage_wrong_attempts"] = inc.get("triage_wrong_attempts", 0) + 1
                    self._persist_incident(inc, db=db)
                    assigned = self._engineer_for_service(inc["service_id"])
                    if assigned:
                        assigned["stress_index"] = formulas.clamp_percentage(
                            assigned["stress_index"] + formulas.TRIAGE_WRONG_ATTEMPT_STRESS
                        )
                        self._persist_engineer(assigned, db=db)
                db.commit()
            finally:
                db.close()
        return {"success": True, "correct": correct}

    def _service_needs_runbook(self, srv: Dict[str, Any]) -> bool:
        """A RUNBOOK ONLY MAKES SENSE ON A SERVICE WITH AN OPEN INCIDENT, OR ONE ALREADY VISIBLY SICK
        (SCENARIO-DRIVEN DEGRADATION CARRIES NO INCIDENT ROW), OR THE RANSOMWARE SCENARIO'S INFECTED
        NODES (WHICH CAN LOOK HEALTHY WHILE STILL NEEDING THE CIRCUIT-BREAKER QUARANTINE)"""
        if any(
            inc["service_id"] == srv["id"] and inc["status"] in ("active", "acknowledged") for inc in self.incidents
        ):
            return True
        if (
            srv["status"] != "healthy"
            or srv["latency_ms"] > HEALTHY_LATENCY_CEILING_MS
            or srv["error_rate"] > HEALTHY_ERROR_RATE_CEILING
        ):
            return True
        scenario = self.active_scenario
        return bool(
            scenario
            and scenario.scenario_id == "ransomware_infiltration"
            and srv["id"] in scenario.infected_service_ids
        )

    def apply_mitigation(self, action_id: str, service_id: str) -> Dict[str, Any]:
        """EXECUTE SRE MITIGATION RUNBOOK, HEALING THE SERVICE FULLY WHEN THE CHOSEN RUNBOOK
        ACTUALLY FITS THE INCIDENT'S UNDERLYING CAUSE, OR ONLY PARTIALLY (AND AT AN EXTRA TECH
        DEBT COST) WHEN IT DOESN'T -- SEE formulas.MITIGATION_EFFECTIVENESS"""
        srv = next((s for s in self.services if s["id"] == service_id), None)
        if not srv:
            return {"success": False, "error": "Service not found"}

        action = formulas.find_mitigation(action_id)
        if not action:
            return {"success": False, "error": "Unknown mitigation action"}

        last_fired = self.mitigation_last_fired_tick.get(action_id)
        if last_fired is not None:
            elapsed = self.current_tick - last_fired
            if elapsed < action["cooldown_ticks"]:
                return {
                    "success": False,
                    "error": f"Runbook on cooldown: {action['cooldown_ticks'] - elapsed} tick(s) remaining",
                }

        if self.active_scenario:
            blocked_reason = self.active_scenario.mitigation_block_reason(action_id, service_id)
            if blocked_reason:
                return {"success": False, "error": blocked_reason}

        if not self._service_needs_runbook(srv):
            # without this the "no matching incident" path assumed an acute_defect cause, so a
            # rollback/scale/circuit-breaker on a healthy service charged the cost and degraded it
            return {"success": False, "error": "No open incident on this service"}

        if self.feature_freeze_active and action["category"] == "hotfix":
            # the freeze blocks *discretionary* risky changes -- it must never block remediating
            # the very incident that's burning the error budget in the first place (standard
            # error-budget-policy behavior). without this exception, a cause category whose only
            # fully-resolving runbook happens to be a hotfix (see formulas.MITIGATION_EFFECTIVENESS's
            # "acute_defect" column, where every non-hotfix action tops out below
            # MITIGATION_FULL_RESOLUTION_THRESHOLD) could never be resolved once its own SLA damage
            # triggers the freeze -- an unrecoverable soft-lock, since the service can't return to
            # healthy any other way and the freeze can't lift while it stays degraded.
            targets_open_incident = any(
                inc["service_id"] == service_id and inc["status"] in ("active", "acknowledged")
                for inc in self.incidents
            )
            if not targets_open_incident:
                return {
                    "success": False,
                    "error": "Feature freeze active: high-risk runbooks disabled pending tech debt remediation",
                }

        if (
            self.active_scenario
            and self.active_scenario.scenario_id == "black_friday_rush"
            and action_id in ("rollback", "emergency_patch")
            and srv["latency_ms"] > 500
        ):
            return {
                "success": False,
                "error": "Black Friday Rush: only Spin Replicas is permitted to address capacity-driven degradation",
            }

        # automated ci/cd halves rollback's *base* cost and tech debt penalty, before any
        # cause-mismatch tax is added below -- the upgrade discounts the runbook itself, it
        # doesn't change how well it fits the diagnosis
        effective_cost = action["cost"]
        effective_tdi_delta = action["tech_debt_delta"]
        if action_id == "rollback" and "automated_cicd" in self.purchased_upgrade_ids:
            effective_cost *= 0.50
            effective_tdi_delta = int(effective_tdi_delta * 0.50)

        # a correctly triaged root cause discounts cost, scaled by how clean the investigation
        # was (formulas.triage_accuracy erodes with each wrong guess made first) rather than a
        # flat bonus for eventually clicking the right line
        matching_incident = next(
            (
                inc for inc in self.incidents
                if inc["service_id"] == service_id and inc["status"] in ("active", "acknowledged")
            ),
            None,
        )
        triage_accuracy = (
            matching_incident.get("triage_accuracy", 0.0)
            if matching_incident and matching_incident["triage_solved"]
            else 0.0
        )
        effective_cost *= 1.0 - formulas.TRIAGE_COST_DISCOUNT_MAX * triage_accuracy

        if self.budget < effective_cost:
            return {"success": False, "error": "Insufficient budget runway"}

        # scripted challenge scenarios keep today's "any permitted runbook fully heals" balance:
        # their difficulty already comes from their own bespoke rules (the latency-gated action
        # lock above, ransomware quarantine below, chaos strikes) rather than from diagnosing the
        # right cause category, and retrofitting that here would undercut their tested victory
        # conditions (e.g. ransomware's quarantine-reliability assumption).
        scripted_scenario_active = bool(self.active_scenario and self.active_scenario.scenario_id != "custom")
        cause_category: Optional[str] = None
        if scripted_scenario_active:
            effectiveness = 1.0
        else:
            cause_category = (
                cause_category_for_root_cause(matching_incident["root_cause"]) if matching_incident else "acute_defect"
            )
            quality = formulas.specialist_quality(
                self._engineer_for_service(service_id), staff.SERVICE_COMPETENCY_MAP, service_id
            )
            effectiveness = formulas.mitigation_effectiveness(action_id, cause_category, action["resolve_speed_multiplier"])
            effectiveness = min(
                1.0, effectiveness + 0.12 * quality + formulas.TRIAGE_EFFECTIVENESS_BONUS_MAX * triage_accuracy
            )

        fully_resolved = effectiveness >= formulas.MITIGATION_FULL_RESOLUTION_THRESHOLD
        if not fully_resolved:
            # a poorly-fit runbook still bolts a workaround onto the wrong problem
            effective_tdi_delta += formulas.mismatch_tech_debt_tax(effectiveness)

        # apply tech debt modification now -- charged regardless of outcome quality; the budget
        # side is applied via _apply_financial_event once the full outcome (resolved_count) below
        # is known, so the single audit/ledger entry captures the complete picture in one call
        self.tech_debt = formulas.clamp_tech_debt(self.tech_debt + effective_tdi_delta)
        self.mitigation_last_fired_tick[action_id] = self.current_tick

        if fully_resolved:
            srv["status"] = "healthy"
            srv["latency_ms"] = random.randint(25, 60)
            srv["error_rate"] = 0.0001
        else:
            # partial fit: nudges the service toward health without fully clearing it, proportional
            # to how well the tool actually matched. the incident is deliberately left open below --
            # its own already-existing burn/surcharge accruing for longer *is* the cost of a
            # mismatched pick, without inventing a new penalty or a random reincidence roll.
            srv["status"] = "degraded"
            srv["latency_ms"] = max(45, int(formulas.interpolate_partial_recovery(srv["latency_ms"], 45, effectiveness)))
            srv["error_rate"] = max(0.0001, formulas.interpolate_partial_recovery(srv["error_rate"], 0.0001, effectiveness))

        if (
            self.active_scenario
            and self.active_scenario.scenario_id == "ransomware_infiltration"
            and action_id == "circuit_breaker"
            and service_id in self.active_scenario.infected_service_ids
        ):
            self.active_scenario.quarantined_service_ids.add(service_id)

        # the specific incident this runbook targeted, if any -- captured now (before a full
        # resolution below removes it from self.incidents) so the RUNBOOK_EXECUTED event and its
        # ledger reference always know exactly which incident they belong to, never just "the
        # most recent event on this service" (see _build_incident_dossier)
        incident_id = matching_incident["id"] if matching_incident else None

        # mark matching active incidents as resolved -- only when the runbook actually worked.
        # every incident row resolved here plus the RUNBOOK_EXECUTED financial event below (cost
        # debited, audit event logged, session scalars persisted) are one logical consequence of
        # this single mitigation -- committed together, under one lock hold, so a crash partway
        # through can never leave e.g. an incident marked resolved with its cost never actually
        # debited, or debited with no matching resolved-incident row.
        resolved_count = 0
        with self._db_write_lock:
            db = SessionLocal()
            try:
                if fully_resolved:
                    for inc in self.incidents:
                        if inc["service_id"] == service_id and inc["status"] in ("active", "acknowledged"):
                            inc["status"] = "resolved"
                            inc["resolved_tick"] = self.current_tick
                            # frozen now, at actual resolution time -- never recomputed later from
                            # session.tech_debt (self.tech_debt already reflects effective_tdi_delta above)
                            inc["tech_debt_at_resolution"] = self.tech_debt
                            self._persist_incident(inc, db=db)
                            resolved_count += 1
                    self._resolved_incident_count += resolved_count
                    self.incidents = [i for i in self.incidents if i["status"] != "resolved"]

                self._apply_financial_event(
                    category="mitigation_cost",
                    amount=-effective_cost,
                    reference=incident_id or service_id,
                    audit_event_type="RUNBOOK_EXECUTED",
                    audit_details={
                        "action": action["name"],
                        "service_id": service_id,
                        "incident_id": incident_id,
                        "cost": effective_cost,
                        "tech_debt_delta": effective_tdi_delta,
                        "tech_debt_after": self.tech_debt,
                        "resolved_incidents": resolved_count,
                        "cause_category": cause_category,
                        "effectiveness": round(effectiveness, 2),
                        "fully_resolved": fully_resolved,
                    },
                    db=db,
                )
                db.commit()
            finally:
                db.close()

        return {"success": True, "service": srv, "budget": self.budget, "tech_debt": self.tech_debt}

    TUTORIAL_SERVICE_ID = "srv-notify"
    TUTORIAL_ROOT_CAUSE = "Memory leak in connection pooling thread"

    def spawn_tutorial_incident(self) -> Dict[str, Any]:
        """RAISE THE GUIDED TUTORIAL'S DETERMINISTIC P2 INCIDENT ON srv-notify THROUGH THE NORMAL
        INCIDENT PIPELINE (LOG STREAM, AUDIT EVENT, PERSISTENCE). ITS ROOT CAUSE IS A deploy_regression,
        SO A ROLLBACK FULLY RESOLVES IT. REFUSED WHILE ANY INCIDENT IS OPEN OR THE RUN HAS ENDED."""
        if self.status in ("bankrupted", "victory"):
            return {"success": False, "error": "The run has ended: reset before starting the tutorial incident"}
        if any(inc["status"] in ("active", "acknowledged") for inc in self.incidents):
            return {"success": False, "error": "An incident is already open: resolve it before the tutorial incident"}
        srv = next((s for s in self.services if s["id"] == self.TUTORIAL_SERVICE_ID), None)
        if srv is None or srv["status"] != "healthy":
            return {"success": False, "error": f"{self.TUTORIAL_SERVICE_ID} is not healthy: cannot stage the tutorial incident"}
        incident = self._trigger_service_failure(srv, root_cause=self.TUTORIAL_ROOT_CAUSE)
        return {"success": True, "incident": self.public_incident(incident)}

    def purchase_upgrade(self, upgrade_id: str) -> Dict[str, Any]:
        """PURCHASE A PERMANENT UPGRADE, VALIDATING PREREQUISITES AND BUDGET"""
        upgrade = upgrades.find_upgrade(upgrade_id)
        if not upgrade:
            return {"success": False, "error": "Unknown upgrade id"}
        if upgrade_id in self.purchased_upgrade_ids:
            return {"success": False, "error": "Upgrade already purchased"}
        prereq = upgrade.get("prerequisite")
        if prereq and prereq not in self.purchased_upgrade_ids:
            return {"success": False, "error": f"Prerequisite upgrade not yet purchased: {prereq}"}
        if self.budget < upgrade["cost"]:
            return {"success": False, "error": "Insufficient budget runway"}

        self.purchased_upgrade_ids.add(upgrade_id)
        self._persist_upgrade_purchase(upgrade_id, upgrade["cost"])
        self._apply_financial_event(
            category="upgrade_purchase",
            amount=-upgrade["cost"],
            reference=upgrade_id,
            audit_event_type="UPGRADE_PURCHASED",
            audit_details={"upgrade_id": upgrade_id, "cost": upgrade["cost"], "category": upgrade["category"]},
        )
        return {"success": True, "upgrade_id": upgrade_id, "budget": self.budget}

    # --- build-mode infrastructure -----------------------------------------

    def place_infrastructure_node(
        self, node_type: str, grid_x: float, grid_y: float, target_service_id: str, producer_service_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """PLACE A NEW HARDWARE MODULE ON THE SERVER ROOM BUILD-MODE GRID"""
        catalog_entry = infrastructure.find_infrastructure_type(node_type)
        if not catalog_entry:
            return {"success": False, "error": "Unknown infrastructure node type"}
        if not any(s["id"] == target_service_id for s in self.services):
            return {"success": False, "error": "Target service not found"}
        if catalog_entry["requires_producer"]:
            if not producer_service_id or not any(s["id"] == producer_service_id for s in self.services):
                return {"success": False, "error": "Producer service required for this node type"}
        if self.budget < catalog_entry["cost"]:
            return {"success": False, "error": "Insufficient budget runway"}

        node = {
            "id": f"infra-{uuid.uuid4().hex[:8]}",
            "session_id": self.session_id,
            "node_type": node_type,
            "grid_x": grid_x,
            "grid_y": grid_y,
            "status": "active",
            "config_json": json.dumps({"target_service_id": target_service_id, "producer_service_id": producer_service_id}),
        }
        self.infrastructure_nodes.append(node)
        self._persist_infrastructure_node(node)
        self._apply_financial_event(
            category="infrastructure_purchase",
            amount=-catalog_entry["cost"],
            reference=node["id"],
            audit_event_type="INFRASTRUCTURE_NODE_PLACED",
            audit_details={"node_id": node["id"], "node_type": node_type, "target_service_id": target_service_id, "cost": catalog_entry["cost"]},
        )
        return {"success": True, "node": node, "budget": self.budget}

    def remove_infrastructure_node(self, node_id: str) -> Dict[str, Any]:
        """REMOVE A PLACED INFRASTRUCTURE NODE, NO REFUND"""
        node = next((n for n in self.infrastructure_nodes if n["id"] == node_id), None)
        if not node:
            return {"success": False, "error": "Infrastructure node not found"}
        self.infrastructure_nodes = [n for n in self.infrastructure_nodes if n["id"] != node_id]
        self._delete_infrastructure_node(node_id)
        self._log_audit_event(
            event_type="INFRASTRUCTURE_NODE_REMOVED",
            actor="VP_OF_INFRA",
            details={"node_id": node_id, "node_type": node["node_type"]},
            compliance_flag=True,
        )
        return {"success": True}

    # --- achievements and career progression --------------------------------

    def _evaluate_achievements(self):
        """CHECK EVERY NOT-YET-UNLOCKED ACHIEVEMENT PREDICATE AGAINST CURRENT ENGINE STATE"""
        for entry in achievements.ACHIEVEMENT_CATALOG:
            achievement_id = entry["id"]
            if achievement_id in self.achievements_unlocked:
                continue
            check = achievements.ACHIEVEMENT_CHECKS[achievement_id]
            if not check(self):
                continue
            self.achievements_unlocked.add(achievement_id)
            self.prestige_points += entry["prestige_points"]
            self._persist_achievement(achievement_id)
            self._log_audit_event(
                event_type="ACHIEVEMENT_UNLOCKED",
                actor="AUDIT_SYSTEM",
                details={"achievement_id": achievement_id, "prestige_points": entry["prestige_points"]},
                compliance_flag=True,
            )
            self._pending_broadcasts.append(
                {"type": "ACHIEVEMENT_UNLOCKED", "achievement_id": achievement_id, "name": entry["name"], "prestige_points": entry["prestige_points"]}
            )

    def unlock_cosmetic(self, cosmetic_id: str) -> Dict[str, Any]:
        """SPEND PRESTIGE POINTS TO UNLOCK A COSMETIC OFFICE PROP"""
        cosmetic = cosmetics.find_cosmetic(cosmetic_id)
        if not cosmetic:
            return {"success": False, "error": "Unknown cosmetic id"}
        if cosmetic_id in self.unlocked_cosmetics:
            return {"success": False, "error": "Cosmetic already unlocked"}
        if self.prestige_points < cosmetic["prestige_cost"]:
            return {"success": False, "error": "Insufficient prestige points"}
        self.prestige_points -= cosmetic["prestige_cost"]
        self.unlocked_cosmetics.add(cosmetic_id)
        self._persist_cosmetic_unlock(cosmetic_id)
        self._log_audit_event(
            event_type="COSMETIC_UNLOCKED",
            actor="VP_OF_INFRA",
            details={"cosmetic_id": cosmetic_id, "prestige_cost": cosmetic["prestige_cost"]},
            compliance_flag=True,
        )
        return {"success": True, "cosmetic_id": cosmetic_id, "prestige_points": self.prestige_points}

    # --- custom scenario sandbox --------------------------------------------

    def load_custom_scenario(self, config: Dict[str, Any]):
        """ATTACH A DATA-DRIVEN CUSTOM SCENARIO BUILT FROM A PLAYER-SUPPLIED CONFIGURATION"""
        self.active_scenario = CustomScenario(self, config)
        self.active_scenario.on_start()

    # --- governance ledger ------------------------------------------------

    def _log_audit_event(
        self, event_type: str, actor: str, details: Dict[str, Any], compliance_flag: bool, db: Optional[Any] = None
    ) -> Dict[str, Any]:
        """RECORD AND IMMEDIATELY PERSIST A GOVERNANCE LEDGER ENTRY.

        Pass an existing db session to fold this write into a caller's own shared transaction
        (e.g. an incident row + its corresponding audit event, committed together as one logical
        unit -- see _trigger_service_failure/acknowledge_incident/submit_triage, and
        _apply_financial_event which does this for every audited financial action) instead of
        opening/committing/closing its own."""
        entry = build_audit_entry(self.session_id, self.current_tick, event_type, actor, details, compliance_flag)
        self.audit_logs.append(entry)
        owns_session = db is None
        if owns_session:
            self._db_write_lock.acquire()
            db = SessionLocal()
        try:
            db.add(
                AuditLog(
                    id=entry["id"],
                    session_id=entry["session_id"],
                    tick=entry["tick"],
                    event_type=entry["event_type"],
                    actor=entry["actor"],
                    details_json=json.dumps(entry["details"]),
                    compliance_flag=entry["compliance_flag"],
                )
            )
            if owns_session:
                db.commit()
        finally:
            if owns_session:
                db.close()
                self._db_write_lock.release()
        return entry
