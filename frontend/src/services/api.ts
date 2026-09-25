// thin rest client for the incidentzero simulation backend

import {
  AchievementCatalogEntry,
  ActiveScenario,
  AuditLogEntry,
  CareerRecord,
  CosmeticCatalogEntry,
  CustomScenarioConfig,
  DifficultyId,
  Engineer,
  InfrastructureCatalogEntry,
  InfrastructureNode,
  LogLine,
  ScenarioCatalogEntry,
  Upgrade,
} from "../types/game";
import { getOrCreatePlayerId } from "../utils/playerId";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
export const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws/telemetry";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string; engine_active: boolean; current_tick: number }>("/api/health"),

  getState: () => request("/api/session/state"),

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
    request<{
      incident_id: string;
      reply: string;
      verdict: "PENDING" | "VALID" | "JUSTIFIED" | "NON_COMPLIANT";
      regulatory_fine_adjustment: number;
      transcript_turn: number;
    }>(`/api/audits/postmortem/${incidentId}/interview`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),

  applyInterviewVerdict: (incidentId: string) =>
    request<{ success: boolean; budget: number }>(
      `/api/audits/postmortem/${incidentId}/interview/apply-verdict`,
      { method: "POST" }
    ),

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

  getScenarioCatalog: () => request<ScenarioCatalogEntry[]>("/api/scenarios/catalog"),

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

  getCareerRecords: () =>
    request<CareerRecord[]>(`/api/career/records?player_id=${encodeURIComponent(getOrCreatePlayerId())}&scope=mine`),

  getGlobalCareerRecords: () => request<CareerRecord[]>("/api/career/records?scope=global"),
};
