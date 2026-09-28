// shared telemetry contracts mirroring the backend pydantic schemas

export type ServiceTier = "critical" | "standard";
export type ServiceStatus = "healthy" | "degraded" | "down";
export type IncidentSeverity = "P1_CRITICAL" | "P2_HIGH" | "P3_MEDIUM" | "P4_LOW";
export type IncidentStatus = "active" | "acknowledged" | "mitigated" | "resolved";
export type SessionStatus = "running" | "paused" | "victory" | "bankrupted" | "breached";

export interface Service {
  id: string;
  session_id: string;
  name: string;
  tier: ServiceTier;
  status: ServiceStatus;
  latency_ms: number;
  error_rate: number;
  dependencies: string[];
}

export interface Incident {
  id: string;
  session_id: string;
  service_id: string;
  severity: IncidentSeverity;
  title: string;
  root_cause: string;
  mtta_seconds: number;
  mttr_seconds: number;
  status: IncidentStatus;
  created_tick: number;
  acknowledged_tick: number | null;
  resolved_tick: number | null;
  triage_solved: boolean;
}

export interface AuditLogEntry {
  id: string;
  session_id: string;
  timestamp: string;
  tick: number;
  event_type: string;
  actor: string;
  details: Record<string, unknown>;
  compliance_flag: boolean;
}

export interface MitigationAction {
  id: string;
  name: string;
  description: string;
  cost: number;
  tech_debt_delta: number;
  resolve_speed_multiplier: number;
  cooldown_ticks: number;
  category: string;
}

// tech tree and office upgrades, mirrors app.engine.upgrades.UPGRADE_CATALOG
export type UpgradeId =
  | "apm_tracing"
  | "predictive_anomaly_detection"
  | "multi_az_clusters"
  | "automated_cicd"
  | "espresso_machine"
  | "ergonomic_chairs";
export type UpgradeCategory = "observability" | "resilience" | "facility";

export interface Upgrade {
  id: UpgradeId;
  name: string;
  description: string;
  category: UpgradeCategory;
  cost: number;
  prerequisite: UpgradeId | null;
}

// cab dilemma engine, mirrors app.engine.dilemmas.DILEMMA_POOL
export interface DilemmaChoice {
  id: string;
  label: string;
  budget_delta: number;
  tech_debt_delta: number;
  happiness_delta: number;
  reputation_delta: number;
}

export interface DilemmaOffer {
  dilemma_id: string;
  title: string;
  narrative: string;
  choices: DilemmaChoice[];
  expires_at_tick: number;
}

// staff on-call roster, mirrors app.engine.staff and the engineers table
export type EngineerCompetency = "auth" | "payments" | "gateway" | "db";
export type OnCallStatus = "on_duty" | "off_duty" | "resting";

export interface Engineer {
  id: string;
  session_id: string;
  name: string;
  assigned_service_id: string | null;
  core_competency: EngineerCompetency;
  stress_index: number;
  stamina: number;
  on_call_status: OnCallStatus;
  hired_at_tick: number;
}

// scripted crisis scenarios, mirrors backend.app.engine.scenarios
export type ScenarioId = "black_friday_rush" | "ransomware_infiltration" | "chaos_engineering_drill";

export interface ScenarioCatalogEntry {
  scenario_id: ScenarioId;
  display_name: string;
  duration_ticks: number;
}

export interface ActiveScenario {
  scenario_id: ScenarioId | "custom";
  elapsed_ticks: number;
  duration_ticks: number;
  completed: boolean;
  outcome: Record<string, unknown> | null;
}

// build-mode infrastructure, mirrors app.engine.infrastructure.INFRASTRUCTURE_CATALOG
export type InfrastructureNodeType = "redis_cache" | "kafka_queue" | "db_read_replica" | "nginx_lb";

export interface InfrastructureCatalogEntry {
  node_type: InfrastructureNodeType;
  name: string;
  description: string;
  cost: number;
  requires_producer: boolean;
}

export interface InfrastructureNode {
  id: string;
  session_id: string;
  node_type: InfrastructureNodeType;
  grid_x: number;
  grid_y: number;
  status: string;
  config_json: string;
}

// log triage mini-game, mirrors app.engine.log_generator
export type LogLevel = "INFO" | "WARN" | "ERROR" | "FATAL";

export interface LogLine {
  id: string;
  tick_offset: number;
  level: LogLevel;
  message: string;
}

// achievements and career progression, mirrors app.engine.achievements / app.engine.cosmetics
export interface AchievementCatalogEntry {
  id: string;
  name: string;
  description: string;
  prestige_points: number;
}

export interface CosmeticCatalogEntry {
  id: string;
  name: string;
  description: string;
  prestige_cost: number;
}

// custom scenario sandbox, mirrors app.schemas.scenario.CustomScenarioConfig
export interface ChaosInjectionConfig {
  at_tick: number;
  service_id: string;
}

export interface CustomScenarioConfig {
  duration_ticks: number;
  hazard_multiplier: number;
  budget_floor: number;
  chaos_injections: ChaosInjectionConfig[];
}

export interface TelemetryState {
  type: "TICK_BROADCAST";
  session_id: string;
  tick: number;
  budget: number;
  sla_percentage: number;
  tech_debt: number;
  user_happiness: number;
  status: SessionStatus;
  is_running: boolean;
  tick_rate_seconds: number;
  services: Service[];
  active_incidents: Incident[];
  recent_audits: AuditLogEntry[];
  purchased_upgrades: string[];
  // action_id -> tick it was last fired, the server's own MITIGATION_CATALOG cooldown state
  // (SimulationEngine.mitigation_last_fired_tick) -- the authoritative source for cooldown
  // countdowns, since it is what apply_mitigation actually enforces and it is naturally
  // consistent across a session reset (the engine clears it in reset() same as `tick`)
  mitigation_cooldowns: Record<string, number>;
  error_budget_remaining_ratio: number;
  feature_freeze_active: boolean;
  engineers: Engineer[];
  infrastructure_nodes: InfrastructureNode[];
  achievements_unlocked: string[];
  prestige_points: number;
  unlocked_cosmetics: string[];
  active_scenario: ActiveScenario | null;
  difficulty: DifficultyId;
  reputation: number;
}

// difficulty presets, mirrors app.engine.simulator.DIFFICULTY_PRESETS
export type DifficultyId = "intern" | "standard" | "chaos";

// permanent hall-of-fame entry, mirrors app.models.career.CareerRecord — never wiped by a reset
export interface CareerRecord {
  id: string;
  player_id: string;
  scenario_id: string | null;
  outcome: "victory" | "bankrupted";
  days_survived: number;
  final_sla_percentage: number;
  final_budget: number;
  prestige_earned: number;
}

export const SLA_BENCHMARK = 99.9;
export const SLA_BREACH_THRESHOLD = 99.0;
