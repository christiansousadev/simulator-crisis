import type { ExtraScenarioIdKey, ScenarioIdKey, Translations } from "../i18n/translations";

type NamedKey = ScenarioIdKey | ExtraScenarioIdKey;

// HUMAN-READABLE SCENARIO TITLE FOR ANY SCENARIO ID: sandbox (no id), the player-built custom
// scenario (not in the backend catalog, so it has no catalog name), every translated catalog
// scenario, then the backend display name, and finally a tidy version of the raw id.
export function scenarioName(t: Translations, scenarioId: string | null | undefined, backendName?: string | null): string {
  if (!scenarioId) return t.scenarios.sandbox;
  if (scenarioId === "custom") return t.flow.customScenario;
  const translated = t.scenarios.names[scenarioId as NamedKey];
  if (translated) return translated;
  if (backendName) return backendName;
  return scenarioId
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
