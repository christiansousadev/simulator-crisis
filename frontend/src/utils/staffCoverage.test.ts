import { describe, expect, it } from "vitest";
import {
  competencyForService,
  coveredServiceId,
  defaultHireTarget,
  isSpecialistMatch,
  targetForService,
  uncoveredServiceIds,
} from "./staffCoverage";

const eng = (assigned_service_id: string | null) => ({ assigned_service_id });

describe("staff coverage", () => {
  it("maps services to their nearest competency like the backend", () => {
    expect(competencyForService("srv-auth")).toBe("auth");
    expect(competencyForService("srv-payment")).toBe("payments");
    expect(competencyForService("srv-search")).toBe("gateway");
    expect(competencyForService("srv-unknown")).toBeNull();
    expect(isSpecialistMatch("gateway", "srv-notify")).toBe(true);
    expect(isSpecialistMatch("db", "srv-auth")).toBe(false);
  });

  it("lists the services without an engineer in canonical order", () => {
    expect(uncoveredServiceIds([])).toEqual(["srv-auth", "srv-payment", "srv-api-gw", "srv-search", "srv-notify"]);
    expect(uncoveredServiceIds([eng("srv-auth"), eng("srv-search"), eng(null)])).toEqual(["srv-payment", "srv-api-gw", "srv-notify"]);
  });

  it("defaults the hire to the first vacant service and its matching specialty", () => {
    expect(defaultHireTarget([])).toEqual({ serviceId: "srv-auth", competency: "auth" });
    expect(defaultHireTarget([eng("srv-auth")])).toEqual({ serviceId: "srv-payment", competency: "payments" });
    expect(defaultHireTarget([eng("srv-auth"), eng("srv-payment")])).toEqual({ serviceId: "srv-api-gw", competency: "gateway" });
  });

  it("falls back to the first service when everything is covered", () => {
    const all = ["srv-auth", "srv-payment", "srv-api-gw", "srv-search", "srv-notify"].map(eng);
    expect(defaultHireTarget(all)).toEqual({ serviceId: "srv-auth", competency: "auth" });
  });

  it("re-aligns the specialty when another service is picked", () => {
    expect(targetForService("srv-payment", "auth")).toEqual({ serviceId: "srv-payment", competency: "payments" });
  });

  it("reports the covered service only for a known service id", () => {
    expect(coveredServiceId(eng("srv-api-gw"))).toBe("srv-api-gw");
    expect(coveredServiceId(eng(null))).toBeNull();
    expect(coveredServiceId(eng("srv-ghost"))).toBeNull();
  });
});
