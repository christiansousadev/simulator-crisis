// thin rest client for the incidentzero simulation backend

import {
  AchievementCatalogEntry,
  ActiveScenario,
  AuditLogEntry,
  CareerRecord,
  CareerSummary,
  CosmeticCatalogEntry,
  CustomScenarioConfig,
  DifficultyId,
  DifficultyPresetInfo,
  Engineer,
  Incident,
  InfrastructureCatalogEntry,
  InfrastructureNode,
  LogLine,
  ScenarioCatalogEntry,
  TelemetryState,
  Upgrade,
} from "../types/game";
import { getOrCreatePlayerId } from "../utils/playerId";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
export const WS_URL = `${import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws/telemetry"}?player_id=${encodeURIComponent(getOrCreatePlayerId())}`;

// carries the http status (and Retry-After when the browser may read it) so callers can tell a
// missing llm key (503) or a rate limit (429) from a plain failure; still an Error with the backend's message
export class ApiError extends Error {
  status: number;
  retryAfterSeconds: number | null;
  constructor(message: string, status: number, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const retryAfter = Number(response.headers?.get?.("Retry-After"));
    throw new ApiError(
      typeof body.detail === "string" && body.detail ? body.detail : `Request failed: ${response.status}`,
      response.status,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null
    );
  }
  return response.json() as Promise<T>;
}

export type AuditorVerdict = "PENDING" | "VALID" | "JUSTIFIED" | "NON_COMPLIANT";

// backend-clamped figures only: regulatory_fine_adjustment is positive for a fine, negative for a credit
export interface InterviewTurnResponse {
  incident_id: string;
  reply: string;
  verdict: AuditorVerdict;
  regulatory_fine_adjustment: number;
  adjustment_cap?: number;
  applied?: boolean;
  transcript_turn: number;
}

export interface InterviewHistoryResponse {
  incident_id: string;
  turns: { role: "player" | "auditor"; content: string }[];
  verdict: AuditorVerdict;
  regulatory_fine_adjustment: number;
  adjustment_cap: number;
  applied: boolean;
  transcript_turn: number;
}

export interface ApplyVerdictResponse {
  success: boolean;
  budget: number;
  verdict?: AuditorVerdict;
  applied_amount?: number;
}

export const api = {
  health: () => request<{ status: string; engine_active: boolean; current_tick: number }>("/api/health"),

  // full telemetry snapshot, same shape as a websocket TICK_BROADCAST frame -- used to keep the
  // ui live while the tick loop (and with it, broadcasting) is paused, e.g. during onboarding
  getState: () => request<TelemetryState>("/api/session/state"),

  startSimulation: () => request("/api/session/start", { method: "POST" }),

  pauseSimulation: () => request("/api/session/pause", { method: "POST" }),

  setSpeed: (multiplier: number) =>
    request("/api/session/speed", { method: "POST", body: JSON.stringify({ multiplier }) }),

  resetSimulation: (scenarioId?: string, difficulty?: DifficultyId) =>
    request("/api/session/reset", {
      method: "POST",
      body: JSON.stringify({
        scenario_id: scenarioId ?? null,
        player_id: getOrCreatePlayerId(),
        difficulty: difficulty ?? null,
      }),
    }),

  // spawns the deterministic practice incident for the guided tutorial (fails if one is already open)
  createTutorialIncident: () =>
    request<{ success: boolean; incident: Incident }>("/api/tutorial/incident", { method: "POST" }),

  acknowledgeIncident: (incidentId: string) =>
    request(`/api/incidents/${incidentId}/acknowledge`, { method: "POST" }),

  getMitigationCatalog: () => request("/api/mitigations/catalog"),

  executeMitigation: (actionId: string, serviceId: string) =>
    request("/api/mitigations/execute", {
      method: "POST",
      body: JSON.stringify({ action_id: actionId, service_id: serviceId }),
    }),

  generatePostmortem: (incidentId: string) =>
    request<{ incident_id: string; markdown: string; saved_to: string }>(
      `/api/audits/postmortem/${incidentId}`
    ),

  conductInterview: (incidentId: string, message: string) =>
    request<InterviewTurnResponse>(`/api/audits/postmortem/${incidentId}/interview`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),

  // saved transcript + verdict state; 404 (ApiError) simply means no interview happened yet
  getInterview: (incidentId: string) =>
    request<InterviewHistoryResponse>(`/api/audits/postmortem/${encodeURIComponent(incidentId)}/interview`),

  applyInterviewVerdict: (incidentId: string) =>
    request<ApplyVerdictResponse>(`/api/audits/postmortem/${incidentId}/interview/apply-verdict`, { method: "POST" }),

  getUpgradesCatalog: () => request<Upgrade[]>("/api/upgrades/catalog"),

  purchaseUpgrade: (upgradeId: string) =>
    request<{ success: boolean; upgrade_id: string; budget: number }>(`/api/upgrades/${upgradeId}/purchase`, {
      method: "POST",
    }),

  resolveDilemma: (dilemmaId: string, choiceId: string) =>
    request<{ success: boolean; choice_id: string; budget: number; tech_debt: number }>(
      `/api/dilemmas/${dilemmaId}/resolve`,
      { method: "POST", body: JSON.stringify({ choice_id: choiceId }) }
    ),

  hireEngineer: (coreCompetency: string, assignedServiceId?: string | null) =>
    request<{ success: boolean; engineer: Engineer; budget: number }>("/api/staff/hire", {
      method: "POST",
      body: JSON.stringify({ core_competency: coreCompetency, assigned_service_id: assignedServiceId ?? null }),
    }),

  rotateShift: (engineerId: string) =>
    request<{ success: boolean; engineer: Engineer }>(`/api/staff/${engineerId}/rotate-shift`, {
      method: "POST",
    }),

  getDifficultyPresets: () => request<DifficultyPresetInfo[]>("/api/difficulty/presets"),

  getScenarioCatalog: () =>
    request<ScenarioCatalogEntry[]>(`/api/scenarios/catalog?player_id=${encodeURIComponent(getOrCreatePlayerId())}`),

  getCareerSummary: () =>
    request<CareerSummary>(`/api/career/summary?player_id=${encodeURIComponent(getOrCreatePlayerId())}`),

  getActiveScenario: () => request<{ active: boolean } & Partial<ActiveScenario>>("/api/scenarios/active"),

  loadCustomScenario: (config: CustomScenarioConfig) =>
    request<{ success: boolean }>("/api/scenarios/custom/load", {
      method: "POST",
      body: JSON.stringify(config),
    }),

  getInfrastructureCatalog: () => request<InfrastructureCatalogEntry[]>("/api/infrastructure/catalog"),

  placeInfrastructureNode: (
    nodeType: string,
    gridX: number,
    gridY: number,
    targetServiceId: string,
    producerServiceId?: string
  ) =>
    request<{ success: boolean; node: InfrastructureNode; budget: number }>("/api/infrastructure/nodes", {
      method: "POST",
      body: JSON.stringify({
        node_type: nodeType,
        grid_x: gridX,
        grid_y: gridY,
        target_service_id: targetServiceId,
        producer_service_id: producerServiceId ?? null,
      }),
    }),

  removeInfrastructureNode: (nodeId: string) =>
    request<{ success: boolean }>(`/api/infrastructure/nodes/${nodeId}`, { method: "DELETE" }),

  getIncidentLogs: (incidentId: string) => request<{ lines: LogLine[] }>(`/api/incidents/${incidentId}/logs`),

  submitTriage: (incidentId: string, lineId: string) =>
    request<{ success: boolean; correct: boolean }>(`/api/incidents/${incidentId}/triage`, {
      method: "POST",
      body: JSON.stringify({ line_id: lineId }),
    }),

  getAchievementCatalog: () => request<AchievementCatalogEntry[]>("/api/achievements/catalog"),

  getCosmeticCatalog: () => request<CosmeticCatalogEntry[]>("/api/cosmetics/catalog"),

  unlockCosmetic: (cosmeticId: string) =>
    request<{ success: boolean; cosmetic_id: string; prestige_points: number }>(`/api/cosmetics/${cosmeticId}/unlock`, {
      method: "POST",
    }),

  exportPostmortemPdfUrl: (incidentId: string) => `${API_URL}/api/audits/postmortem/${incidentId}/export-pdf`,

  getAllAudits: () => request<AuditLogEntry[]>("/api/audits"),

  getCareerRecords: (orderBy = "recorded_at", scenarioId?: string, difficulty?: string) => {
    const params = new URLSearchParams({
      player_id: getOrCreatePlayerId(),
      scope: "mine",
      order_by: orderBy,
    });
    if (scenarioId) params.set("scenario_id", scenarioId);
    if (difficulty) params.set("difficulty", difficulty);
    return request<CareerRecord[]>(`/api/career/records?${params.toString()}`);
  },

  getGlobalCareerRecords: (orderBy = "days_survived") => {
    const params = new URLSearchParams({ scope: "global", order_by: orderBy });
    return request<CareerRecord[]>(`/api/career/records?${params.toString()}`);
  },
};
