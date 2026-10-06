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
  // withheld by the backend (null) until triage_solved is true -- see
  // SimulationEngine.public_incidents() -- never guess or fall back to a placeholder string here
  root_cause: string | null;
  mtta_seconds: number;
  mttr_seconds: number;
  status: IncidentStatus;
  created_tick: number;
  acknowledged_tick: number | null;
  resolved_tick: number | null;
  triage_solved: boolean;
  // 0..1 quality of the investigation, only present once triage is solved (drives the cost discount)
  triage_accuracy?: number | null;
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
export type ScenarioId =
  | "black_friday_rush"
  | "ransomware_infiltration"
  | "chaos_engineering_drill"
  | "ddos_global"
  | "deployment_rollback"
  | "third_party_outage";


export interface ScenarioCatalogEntry {
  scenario_id: ScenarioId;
  display_name: string;
  duration_ticks: number;
  description?: string;
  special_conditions?: string[];
  objectives?: string[];
  unlock_requirement?: string | null;
  unlocked?: boolean;
  best_record?: {
    id: string;
    outcome: "victory" | "bankrupted" | "scenario_defeat";
    difficulty: DifficultyId;
    days_survived: number;
    final_sla_percentage: number;
    final_budget: number;
    recorded_at: string | null;
  } | null;
}

export interface DifficultyPresetInfo {
  id: DifficultyId;
  name: string;
  starting_budget: number;
  hazard_multiplier: number;
  budget_delta_label: string;
  incident_rate_label: string;
  cascade_severity: string;
  description: string;
}

export interface NextChallengeSuggestion {
  type: "first_run" | "scenario" | "difficulty" | "achievement" | "mastery";
  challenge_key?: string;
  scenario_id: ScenarioId | null;
  difficulty: DifficultyId;
  title: string;
  description: string;
  target_achievement?: string;
  target_achievement_name?: string;
}

export interface CareerSummary {
  total_runs: number;
  victories: number;
  bankruptcies: number;
  defeats: number;
  total_incidents_resolved: number;
  lifetime_prestige: number;
  operator_rank: string;
  operator_rank_key?: string;
  best_runs: Record<string, CareerRecord | null>;
  recommended_challenge: NextChallengeSuggestion;
}

// a scenario's own objectives, entirely backend-computed (ScenarioEngine.objectives()) -- the
// frontend only ever renders `done`, it never decides completion itself
export interface ScenarioObjective {
  id: string;
  description: string;
  done: boolean;
  // set by the backend when the objective can no longer be met (timer ran out, budget lost...)
  failed?: boolean;
}

export interface ActiveScenario {
  scenario_id: ScenarioId | "custom";
  elapsed_ticks: number;
  duration_ticks: number;
  completed: boolean;
  outcome: Record<string, unknown> | null;
  objectives: ScenarioObjective[];
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
  // optional starting conditions; omitted = the difficulty default
  starting_budget?: number;
  starting_tech_debt?: number;
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

// permanent hall-of-fame entry, mirrors app.models.career.CareerRecord — never wiped by a reset.
// the fields below final_budget are all nullable: a record written before they existed has no
// historical value to backfill (see backend's own migration comment), so the frontend must treat
// their absence as "not available" rather than assuming 0/empty.
export interface CareerRecord {
  id: string;
  player_id: string;
  scenario_id: string | null;
  difficulty?: DifficultyId;
  outcome: "victory" | "bankrupted" | "scenario_defeat";
  days_survived: number;
  final_sla_percentage: number;
  final_budget: number;
  prestige_earned: number;
  recorded_at?: string | null;
  final_tech_debt: number | null;
  final_reputation: number | null;
  incidents_total: number | null;
  incidents_resolved: number | null;
  scenario_outcome: Record<string, unknown> | null;
  objectives: ScenarioObjective[] | null;
}

export const SLA_BENCHMARK = 99.9;
export const SLA_BREACH_THRESHOLD = 99.0;
