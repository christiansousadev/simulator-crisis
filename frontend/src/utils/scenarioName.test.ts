import { describe, expect, it } from "vitest";
import { TRANSLATIONS } from "../i18n/translations";
import { scenarioName } from "./scenarioName";

const t = TRANSLATIONS.en;

describe("scenarioName", () => {
  it("returns the sandbox label when there is no scenario", () => {
    expect(scenarioName(t, null)).toBe(t.scenarios.sandbox);
    expect(scenarioName(t, undefined)).toBe(t.scenarios.sandbox);
  });

  it("names the player-built scenario, which is not in the backend catalog", () => {
    expect(scenarioName(t, "custom")).toBe(t.flow.customScenario);
  });

  it("translates every catalog scenario, including the three added later", () => {
    for (const id of [
      "black_friday_rush",
      "ransomware_infiltration",
      "chaos_engineering_drill",
      "ddos_global",
      "deployment_rollback",
      "third_party_outage",
    ]) {
      const name = scenarioName(t, id);
      expect(name).not.toBe(id);
      expect(name.length).toBeGreaterThan(3);
    }
    expect(scenarioName(t, "ddos_global")).toBe("DDoS Global Attack");
  });

  it("falls back to the backend name, then to a tidy version of the raw id", () => {
    expect(scenarioName(t, "future_scenario", "Future Scenario Prime")).toBe("Future Scenario Prime");
    expect(scenarioName(t, "future_scenario")).toBe("Future Scenario");
  });
});
