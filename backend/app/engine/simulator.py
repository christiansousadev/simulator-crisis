import asyncio
import json
import random
import uuid
from typing import Any, Dict, List, Optional, Set

from fastapi import WebSocket

from app.core.database import SessionLocal
from app.engine import achievements, cosmetics, dilemmas, formulas, infrastructure, staff, upgrades
from app.engine.event_generator import build_audit_entry, build_incident
from app.engine.scenarios import SCENARIO_REGISTRY
from app.engine.scenarios.custom_scenario import CustomScenario
from app.models.achievement import Achievement
from app.models.audit import AuditLog
from app.models.cosmetic import UnlockedCosmetic
from app.models.dilemma import DilemmaEvent
from app.models.engineer import Engineer
from app.models.incident import Incident
from app.models.infrastructure import InfrastructureNode
from app.models.service import Service
from app.models.career import CareerRecord
from app.models.session import GameSession
from app.models.upgrade import PurchasedUpgrade

DEFAULT_PLAYER_ID = "local-player"

# starting budget and incident-hazard multiplier per difficulty preset, applied on reset()
DIFFICULTY_PRESETS: Dict[str, Dict[str, float]] = {
    "intern": {"starting_budget": 320000.0, "hazard_multiplier": 0.7},
    "standard": {"starting_budget": 250000.0, "hazard_multiplier": 1.0},
    "chaos": {"starting_budget": 180000.0, "hazard_multiplier": 1.4},
}
DEFAULT_DIFFICULTY = "standard"

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

# one monthly sla audit cycle, per the architecture tick scale
VICTORY_TICK_THRESHOLD = 720

# minimum ticks before the cumulative sla is considered statistically meaningful
BREACH_GRACE_TICKS = 24

# rolling sample window used to derive the error budget burn rate
ERROR_BUDGET_BURN_RATE_WINDOW = 10

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
        self.cumulative_sla_points: float = 100.0
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

        # crash/restart resilience: if a prior process left an in-progress run for this exact
        # session_id, pick it back up instead of silently discarding it. only the core survival
        # stats, service topology and hired roster are restorable from what _persist_snapshot()
        # captures; any incident that was actively open at the moment of the restart is dropped
        # (its snapshot row lacks the runtime-only fields, e.g. triage log lines, needed to safely
        # resume mid-incident) rather than risk reconstructing a broken incident dict.
        if not self._try_restore_from_snapshot():
            self._persist_bootstrap()

    def _init_default_services(self) -> List[Dict[str, Any]]:
        """INITIALIZE CORE PLATFORM SERVICES WITH TIER TOPOLOGY"""
        return [
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

    # --- persistence -----------------------------------------------------

    def _try_restore_from_snapshot(self) -> bool:
        """REHYDRATE FROM A PRIOR PROCESS'S LAST PERSISTED SNAPSHOT, IF ONE EXISTS AND IS RESUMABLE

        Returns True when restoration succeeded and the fresh-bootstrap path should be skipped.
        A snapshot is only resumable if it belongs to this exact session_id and its run had not
        already reached a terminal state (a finished game should not silently "come back").
        """
        db = SessionLocal()
        try:
            row = db.get(GameSession, self.session_id)
            if row is None or row.status in ("bankrupted", "victory") or row.current_tick <= 0:
                return False

            self.status = row.status
            self.current_tick = row.current_tick
            self.budget = float(row.budget)
            self.tech_debt = row.tech_debt
            self.user_happiness = float(row.user_happiness)
            self.sla_percentage = float(row.sla_percentage)
            # not captured by the snapshot; re-derived from the restored instantaneous sla as the
            # closest safe approximation rather than fabricating a false historical average
            self.cumulative_sla_points = self.sla_percentage
            self.prestige_points = row.prestige_points

            restored_services = (
                db.query(Service).filter(Service.session_id == self.session_id).all()
            )
            if restored_services:
                self.services = [
                    {
                        "id": s.id,
                        "session_id": s.session_id,
                        "name": s.name,
                        "tier": s.tier,
                        # any service left mid-incident is restored healthy: its incident record
                        # itself is intentionally not resumed (see class docstring above this call)
                        "status": "healthy",
                        "latency_ms": s.latency_ms,
                        "error_rate": float(s.error_rate),
                        "dependencies": json.loads(s.dependencies_json),
                    }
                    for s in restored_services
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

            self._log_audit_event(
                event_type="SYSTEM_RESTORED",
                actor="PLATFORM",
                details={
                    "restored_tick": self.current_tick,
                    "note": "Backend process restarted; run resumed from last snapshot. Any incident open at the moment of restart was cleared rather than resumed.",
                },
                compliance_flag=True,
            )
            return True
        finally:
            db.close()

    def _persist_bootstrap(self):
        """RESET DATABASE STATE FOR A FRESH SIMULATION RUN"""
        db = SessionLocal()
        try:
            existing = db.get(GameSession, self.session_id)
            if existing:
                # cascades to services, incidents, audit logs, upgrades, dilemmas and engineers
                db.delete(existing)
                db.commit()
            db.add(
                GameSession(
                    id=self.session_id,
                    player_name=self.player_name,
                    budget=self.budget,
                    sla_percentage=self.sla_percentage,
                    tech_debt=self.tech_debt,
                    user_happiness=self.user_happiness,
                    status=self.status,
                    current_tick=self.current_tick,
                    prestige_points=self.prestige_points,
                )
            )
            for srv in self.services:
                db.add(
                    Service(
                        id=srv["id"],
                        session_id=self.session_id,
                        name=srv["name"],
                        tier=srv["tier"],
                        status=srv["status"],
                        latency_ms=srv["latency_ms"],
                        error_rate=srv["error_rate"],
                        dependencies_json=json.dumps(srv["dependencies"]),
                    )
                )
            db.commit()
        finally:
            db.close()

    def _persist_snapshot(self):
        """UPSERT CURRENT SESSION, SERVICE, INCIDENT AND ENGINEER STATE INTO THE DATABASE"""
        db = SessionLocal()
        try:
            db.merge(
                GameSession(
                    id=self.session_id,
                    player_name=self.player_name,
                    budget=self.budget,
                    sla_percentage=self.sla_percentage,
                    tech_debt=self.tech_debt,
                    user_happiness=self.user_happiness,
                    status=self.status,
                    current_tick=self.current_tick,
                    prestige_points=self.prestige_points,
                )
            )
            for srv in self.services:
                db.merge(
                    Service(
                        id=srv["id"],
                        session_id=self.session_id,
                        name=srv["name"],
                        tier=srv["tier"],
                        status=srv["status"],
                        latency_ms=srv["latency_ms"],
                        error_rate=srv["error_rate"],
                        dependencies_json=json.dumps(srv["dependencies"]),
                    )
                )
            for inc in self.incidents:
                db.merge(
                    Incident(
                        id=inc["id"],
                        session_id=inc["session_id"],
                        service_id=inc["service_id"],
                        severity=inc["severity"],
                        title=inc["title"],
                        root_cause=inc["root_cause"],
                        mtta_seconds=inc["mtta_seconds"],
                        mttr_seconds=inc["mttr_seconds"],
                        status=inc["status"],
                        created_tick=inc["created_tick"],
                        acknowledged_tick=inc["acknowledged_tick"],
                        resolved_tick=inc["resolved_tick"],
                        triage_solved=inc["triage_solved"],
                    )
                )
            for eng in self.engineers:
                db.merge(
                    Engineer(
                        id=eng["id"],
                        session_id=eng["session_id"],
                        name=eng["name"],
                        assigned_service_id=eng["assigned_service_id"],
                        core_competency=eng["core_competency"],
                        stress_level=int(eng["stress_index"]),
                        stamina=int(eng["stamina"]),
                        on_call_status=eng["on_call_status"],
                        hired_at_tick=eng["hired_at_tick"],
                    )
                )
            db.commit()
        finally:
            db.close()

    def _persist_incident(self, inc: Dict[str, Any]):
        """UPSERT A SINGLE INCIDENT ROW IMMEDIATELY, USED FOR TERMINAL STATE CHANGES"""
        db = SessionLocal()
        try:
            db.merge(
                Incident(
                    id=inc["id"],
                    session_id=inc["session_id"],
                    service_id=inc["service_id"],
                    severity=inc["severity"],
                    title=inc["title"],
                    root_cause=inc["root_cause"],
                    mtta_seconds=inc["mtta_seconds"],
                    mttr_seconds=inc["mttr_seconds"],
                    status=inc["status"],
                    created_tick=inc["created_tick"],
                    acknowledged_tick=inc["acknowledged_tick"],
                    resolved_tick=inc["resolved_tick"],
                    triage_solved=inc["triage_solved"],
                )
            )
            db.commit()
        finally:
            db.close()

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

    def _persist_engineer(self, eng: Dict[str, Any]):
        """UPSERT A SINGLE ENGINEER ROW IMMEDIATELY, USED FOR HIRING AND SHIFT ROTATION"""
        db = SessionLocal()
        try:
            db.merge(
                Engineer(
                    id=eng["id"],
                    session_id=eng["session_id"],
                    name=eng["name"],
                    assigned_service_id=eng["assigned_service_id"],
                    core_competency=eng["core_competency"],
                    stress_level=int(eng["stress_index"]),
                    stamina=int(eng["stamina"]),
                    on_call_status=eng["on_call_status"],
                    hired_at_tick=eng["hired_at_tick"],
                )
            )
            db.commit()
        finally:
            db.close()

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

    def _persist_career_record(self, outcome: str):
        """WRITE A PERMANENT HALL-OF-FAME ENTRY FOR THIS CONCLUDED RUN"""
        db = SessionLocal()
        try:
            db.add(
                CareerRecord(
                    id=f"career-{uuid.uuid4().hex[:8]}",
                    player_id=self.player_id,
                    scenario_id=self.active_scenario.scenario_id if self.active_scenario else None,
                    outcome=outcome,
                    days_survived=self.current_tick // 24,
                    final_sla_percentage=round(self.sla_percentage, 2),
                    final_budget=round(self.budget, 2),
                    prestige_earned=self.prestige_points,
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
        await self._broadcast_json(self.get_state_payload())

    async def _flush_pending_broadcasts(self):
        """SEND ANY OUT-OF-BAND EVENT FRAMES QUEUED DURING THE LAST TICK"""
        queued, self._pending_broadcasts = self._pending_broadcasts, []
        for payload in queued:
            await self._broadcast_json(payload)

    def public_incidents(self) -> List[Dict[str, Any]]:
        """STRIP THE TRIAGE ANSWER KEY (log_lines, root_cause_line_id) BEFORE ANY WIRE SERIALIZATION"""
        return [{k: v for k, v in inc.items() if k not in ("log_lines", "root_cause_line_id")} for inc in self.incidents]

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
        self.cumulative_sla_points = 100.0
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

        self.engineers = []

        self.active_scenario = None
        self._scenario_hazard_multiplier = 1.0
        if scenario_id:
            scenario_cls = SCENARIO_REGISTRY.get(scenario_id)
            if scenario_cls:
                self.active_scenario = scenario_cls(self)

        self.infrastructure_nodes = []

        # achievements, prestige and cosmetics are permanent career progress: a new game does not
        # touch them, only _load_career_progress() (on player_id change) reloads them from disk
        self._resolved_incident_count = 0
        self._night_shift_ack_seen = False
        self._first_response_seen = False

        self._pending_broadcasts = []

        self._persist_bootstrap()
        self.start()

    async def _run_loop(self):
        """PRIMARY TICK ADVANCEMENT AND STATE PROPAGATION LOOP"""
        try:
            while self.is_running:
                await asyncio.sleep(self.tick_rate_seconds)
                self.current_tick += 1
                self._update_simulation_tick()
                await asyncio.to_thread(self._persist_snapshot)
                await self.broadcast_state()
                await self._flush_pending_broadcasts()
        except asyncio.CancelledError:
            # handle cooperative task cancellation on pause
            pass

    # --- tick evolution -------------------------------------------------

    def _update_simulation_tick(self):
        """EXECUTE SYSTEMIC DEGRADATION, BURN RATES, INCIDENT PENALTIES AND CASCADE RISK"""
        instant_sla = formulas.instant_sla_percentage(self.services)
        self.cumulative_sla_points += instant_sla
        self.sla_percentage = self.cumulative_sla_points / (self.current_tick + 1)
        self._update_error_budget_tracking()

        self._apply_budget_burn()
        self._apply_happiness_drift()
        self._progress_incidents()
        self._apply_quiet_period_refactor()
        self._evaluate_random_failures()
        self._evaluate_session_status()

        self._evaluate_feature_freeze()
        self._progress_staff_fatigue()
        self._progress_pre_alerts()
        self._evaluate_cab_dilemma()
        self._evaluate_achievements()

        if self.active_scenario and not self.active_scenario.completed:
            self.active_scenario.elapsed_ticks += 1
            self.active_scenario.on_tick()
            outcome = self.active_scenario.evaluate_victory()
            if outcome is not None:
                self.active_scenario.completed = True
                self.active_scenario.outcome = outcome
                self._log_audit_event(
                    event_type="SCENARIO_CONCLUDED",
                    actor="AUDIT_SYSTEM",
                    details=outcome,
                    compliance_flag=outcome.get("compliant", True),
                )

    def _apply_budget_burn(self):
        """DEDUCT PASSIVE BURN PLUS UNRESOLVED INCIDENT SURCHARGES, FATIGUE-ADJUSTED"""
        base_burn = formulas.effective_passive_burn(self.user_happiness)
        incident_burn = 0.0
        for inc in self.incidents:
            if inc["status"] not in ("active", "acknowledged"):
                continue
            effective_mttr = inc["mttr_seconds"]
            assigned = self._engineer_for_service(inc["service_id"])
            if assigned and assigned["stress_index"] > formulas.STRESS_MTTR_DOUBLE_THRESHOLD:
                effective_mttr *= 2
            incident_burn += formulas.incident_surcharge(inc["severity"], effective_mttr)
        self.budget = max(0.0, self.budget - (base_burn + incident_burn))

    def _apply_happiness_drift(self):
        """DRIFT USER HAPPINESS BASED ON OUTAGE SEVERITY AND ALERT FATIGUE"""
        dampener = 0.75 if "espresso_machine" in self.purchased_upgrade_ids else 1.0
        any_down_or_degraded = any(s["status"] != "healthy" for s in self.services)
        if any_down_or_degraded:
            self.user_happiness = max(5.0, self.user_happiness - 0.7 * dampener)
        elif self.user_happiness < 98.0:
            self.user_happiness = min(100.0, self.user_happiness + 0.2)

        for inc in self.incidents:
            if inc["status"] == "active":
                penalty = formulas.alert_fatigue_penalty(inc["mtta_seconds"])
                if penalty > 0:
                    self.user_happiness = max(0.0, self.user_happiness - penalty * dampener)

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
                    if formulas.is_unattended_breach(effective_mtta):
                        self._log_audit_event(
                            event_type="UNATTENDED_ALERT_VIOLATION",
                            actor="AUDIT_SYSTEM",
                            details={"incident_id": inc["id"], "fine_amount": formulas.UNATTENDED_BREACH_FINE},
                            compliance_flag=False,
                        )
                        self.budget = max(0.0, self.budget - formulas.UNATTENDED_BREACH_FINE)

    def _apply_quiet_period_refactor(self):
        """GRANT AMBIENT TECHNICAL DEBT RELIEF DURING SUSTAINED QUIET PERIODS"""
        if self.incidents:
            self.quiet_ticks = 0
            return
        self.quiet_ticks += 1
        if self.quiet_ticks % QUIET_REFACTOR_INTERVAL_TICKS == 0 and self.tech_debt > 0:
            self.tech_debt = max(0, self.tech_debt - QUIET_REFACTOR_TDI_RELIEF)
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

    def _evaluate_random_failures(self):
        """TRIGGER SPONTANEOUS OUTAGES BASED ON TECH DEBT AND TOPOLOGY"""
        if len(self.incidents) >= MAX_CONCURRENT_INCIDENTS:
            # throttle simultaneous active alarms to prevent unplayable overwhelm
            return
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
            if random.random() < failure_probability:
                if "predictive_anomaly_detection" in self.purchased_upgrade_ids:
                    self._queue_pre_alert(srv)
                else:
                    self._trigger_service_failure(srv)

    def _trigger_service_failure(self, srv: Dict[str, Any]):
        """DEGRADE OR COLLAPSE A SERVICE AND RAISE INCIDENT"""
        incident = build_incident(srv, self.current_tick)
        srv["status"] = "down" if incident["severity"] == "P1_CRITICAL" else "degraded"
        srv["latency_ms"] = random.randint(850, 2400)
        if self._infrastructure_nodes_for(srv["id"], "redis_cache"):
            srv["latency_ms"] = int(srv["latency_ms"] * infrastructure.REDIS_LATENCY_DAMPENER)
        srv["error_rate"] = round(random.uniform(0.15, 0.85), 4)

        self.incidents.append(incident)
        self._log_audit_event(
            event_type="INCIDENT_RAISED",
            actor="AUTOMATED_MONITOR",
            details={"service_id": srv["id"], "severity": incident["severity"], "incident_id": incident["id"]},
            compliance_flag=True,
        )

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
        """TRANSITION SESSION STATUS BASED ON BUDGET AND SLA THRESHOLDS"""
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
                self._persist_career_record(outcome="bankrupted")
            self.is_running = False
            return

        if self.current_tick >= VICTORY_TICK_THRESHOLD and self.sla_percentage >= formulas.SLA_BREACH_THRESHOLD:
            if self.status != "victory":
                self.status = "victory"
                self._log_audit_event(
                    event_type="MONTHLY_AUDIT_CYCLE_SURVIVED",
                    actor="AUDIT_SYSTEM",
                    details={"sla_percentage": round(self.sla_percentage, 2)},
                    compliance_flag=True,
                )
                self._persist_career_record(outcome="victory")
            self.is_running = False
            return

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
        """SAMPLE CUMULATIVE ERROR BUDGET BURN AND DERIVE A ROLLING BURN RATE"""
        unavailability_pct = 100.0 - self.sla_percentage
        burn_ratio = unavailability_pct / formulas.TOTAL_ERROR_BUDGET_PCT
        self._error_budget_history.append(burn_ratio)
        if len(self._error_budget_history) > ERROR_BUDGET_BURN_RATE_WINDOW:
            self._error_budget_history.pop(0)
        if len(self._error_budget_history) >= 2:
            self.error_budget_burn_rate = (
                self._error_budget_history[-1] - self._error_budget_history[0]
            ) / (len(self._error_budget_history) - 1)
        else:
            self.error_budget_burn_rate = 0.0
        self.error_budget_remaining_ratio = max(0.0, 1.0 - burn_ratio)

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
        self.budget = max(0.0, self.budget + choice["budget_delta"])
        self.tech_debt = max(0, min(100, self.tech_debt + choice["tech_debt_delta"]))
        self.user_happiness = max(0.0, min(100.0, self.user_happiness + choice["happiness_delta"]))
        self.reputation = max(0.0, min(100.0, self.reputation + choice.get("reputation_delta", 0)))
        self._persist_dilemma_event(dilemma, choice["id"], self.current_tick, auto_resolved)
        self._log_audit_event(
            event_type="DILEMMA_RESOLVED",
            actor="BOARD_OF_DIRECTORS" if auto_resolved else "VP_OF_INFRA",
            details={
                "dilemma_id": dilemma["id"],
                "choice_id": choice["id"],
                "auto_resolved": auto_resolved,
                "budget_delta": choice["budget_delta"],
                "tech_debt_delta": choice["tech_debt_delta"],
                "happiness_delta": choice["happiness_delta"],
                "reputation_delta": choice.get("reputation_delta", 0),
                "reputation_after": round(self.reputation, 1),
            },
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
                eng["stress_index"] = max(0, eng["stress_index"] - formulas.OFF_DUTY_STRESS_RECOVERY_PER_TICK)
                eng["stamina"] = min(100, eng["stamina"] + formulas.OFF_DUTY_STAMINA_RECOVERY_PER_TICK)
                if eng["on_call_status"] == "resting":
                    # exactly one resting tick, then fully off duty
                    eng["on_call_status"] = "off_duty"
                continue
            eng["stamina"] = max(0, eng["stamina"] - formulas.ON_DUTY_STAMINA_DRAIN_PER_TICK)
            unacked = [
                inc for inc in self.incidents
                if inc["service_id"] == eng["assigned_service_id"] and inc["status"] == "active"
            ]
            for inc in unacked:
                gain = formulas.stress_gain_for_unacked_alarm(eng["stress_index"], inc["severity"])
                if "ergonomic_chairs" in self.purchased_upgrade_ids:
                    gain *= 0.80
                eng["stress_index"] = min(100, eng["stress_index"] + gain)

    def hire_engineer(self, core_competency: str, assigned_service_id: Optional[str]) -> Dict[str, Any]:
        """HIRE A NEW ENGINEER, DEDUCTING A FLAT SIGNING COST FROM RUNWAY BUDGET"""
        if self.budget < formulas.HIRING_COST:
            return {"success": False, "error": "Insufficient budget runway"}
        if core_competency not in ("auth", "payments", "gateway", "db"):
            return {"success": False, "error": "Unknown core competency"}
        engineer = staff.build_engineer(self.session_id, core_competency, assigned_service_id, self.current_tick)
        self.budget -= formulas.HIRING_COST
        self.engineers.append(engineer)
        self._persist_engineer(engineer)
        self._log_audit_event(
            event_type="ENGINEER_HIRED",
            actor="VP_OF_INFRA",
            details={"engineer_id": engineer["id"], "core_competency": core_competency, "cost": formulas.HIRING_COST},
            compliance_flag=True,
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
                self._persist_incident(inc)

                office_hour = self.current_tick % 24
                if office_hour >= 22 or office_hour < 5:
                    self._night_shift_ack_seen = True
                if inc["mtta_seconds"] <= 1:
                    self._first_response_seen = True

                self._log_audit_event(
                    event_type="INCIDENT_ACKNOWLEDGED",
                    actor="VP_OF_INFRA",
                    details={"incident_id": incident_id, "mtta_ticks": inc["mtta_seconds"]},
                    compliance_flag=True,
                )
                return True
        return False

    def submit_triage(self, incident_id: str, line_id: str) -> Dict[str, Any]:
        """CHECK A PLAYER'S ROOT-CAUSE LOG-LINE GUESS AGAINST THE INCIDENT'S RECORDED ANSWER"""
        inc = next((i for i in self.incidents if i["id"] == incident_id), None)
        if not inc:
            return {"success": False, "error": "Incident not found"}
        if inc["triage_solved"]:
            return {"success": True, "correct": True, "already_solved": True}
        correct = line_id == inc["root_cause_line_id"]
        if correct:
            inc["triage_solved"] = True
            inc["mttr_seconds"] = inc["mttr_seconds"] // 2
            self._persist_incident(inc)
            self._log_audit_event(
                event_type="ROOT_CAUSE_IDENTIFIED",
                actor="VP_OF_INFRA",
                details={"incident_id": incident_id, "line_id": line_id},
                compliance_flag=True,
            )
        return {"success": True, "correct": correct}

    def apply_mitigation(self, action_id: str, service_id: str) -> Dict[str, Any]:
        """EXECUTE SRE MITIGATION RUNBOOK AND HEAL SERVICE STATE"""
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

        if self.feature_freeze_active and action["category"] == "hotfix":
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

        # automated ci/cd halves rollback's cost and tech debt penalty
        effective_cost = action["cost"]
        effective_tdi_delta = action["tech_debt_delta"]
        if action_id == "rollback" and "automated_cicd" in self.purchased_upgrade_ids:
            effective_cost *= 0.50
            effective_tdi_delta = int(effective_tdi_delta * 0.50)

        # a correctly triaged root cause halves the mitigation cost on top of any other discount
        triage_bonus = any(
            inc["service_id"] == service_id and inc["status"] in ("active", "acknowledged") and inc["triage_solved"]
            for inc in self.incidents
        )
        if triage_bonus:
            effective_cost *= 0.50

        if self.budget < effective_cost:
            return {"success": False, "error": "Insufficient budget runway"}

        # apply financial and tech debt modifications
        self.budget -= effective_cost
        self.tech_debt = max(0, min(100, self.tech_debt + effective_tdi_delta))
        self.mitigation_last_fired_tick[action_id] = self.current_tick

        # restore service health parameters
        srv["status"] = "healthy"
        srv["latency_ms"] = random.randint(25, 60)
        srv["error_rate"] = 0.0001

        if (
            self.active_scenario
            and self.active_scenario.scenario_id == "ransomware_infiltration"
            and action_id == "circuit_breaker"
            and service_id in self.active_scenario.infected_service_ids
        ):
            self.active_scenario.quarantined_service_ids.add(service_id)

        # mark matching active incidents as resolved
        resolved_count = 0
        for inc in self.incidents:
            if inc["service_id"] == service_id and inc["status"] in ("active", "acknowledged"):
                inc["status"] = "resolved"
                inc["resolved_tick"] = self.current_tick
                self._persist_incident(inc)
                resolved_count += 1

        self._resolved_incident_count += resolved_count
        self.incidents = [i for i in self.incidents if i["status"] != "resolved"]

        self._log_audit_event(
            event_type="RUNBOOK_EXECUTED",
            actor="VP_OF_INFRA",
            details={
                "action": action["name"],
                "service_id": service_id,
                "cost": effective_cost,
                "tech_debt_delta": effective_tdi_delta,
                "resolved_incidents": resolved_count,
            },
            compliance_flag=True,
        )

        return {"success": True, "service": srv, "budget": self.budget, "tech_debt": self.tech_debt}

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

        self.budget -= upgrade["cost"]
        self.purchased_upgrade_ids.add(upgrade_id)
        self._persist_upgrade_purchase(upgrade_id, upgrade["cost"])
        self._log_audit_event(
            event_type="UPGRADE_PURCHASED",
            actor="VP_OF_INFRA",
            details={"upgrade_id": upgrade_id, "cost": upgrade["cost"], "category": upgrade["category"]},
            compliance_flag=True,
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

        self.budget -= catalog_entry["cost"]
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
        self._log_audit_event(
            event_type="INFRASTRUCTURE_NODE_PLACED",
            actor="VP_OF_INFRA",
            details={"node_id": node["id"], "node_type": node_type, "target_service_id": target_service_id, "cost": catalog_entry["cost"]},
            compliance_flag=True,
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

    # --- governance ledger ------------------------------------------------

    def _log_audit_event(
        self, event_type: str, actor: str, details: Dict[str, Any], compliance_flag: bool
    ) -> Dict[str, Any]:
        """RECORD AND IMMEDIATELY PERSIST A GOVERNANCE LEDGER ENTRY"""
        entry = build_audit_entry(self.session_id, self.current_tick, event_type, actor, details, compliance_flag)
        self.audit_logs.append(entry)
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
            db.commit()
        finally:
            db.close()
        return entry
