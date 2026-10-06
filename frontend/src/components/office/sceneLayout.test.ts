import { describe, expect, it } from "vitest";
import { deskGridPosition, pickCrisisServiceId } from "./sceneLayout";

const services = [
  { id: "srv-auth", status: "healthy" as const },
  { id: "srv-payment", status: "degraded" as const },
  { id: "srv-api-gw", status: "down" as const },
];

describe("pickCrisisServiceId", () => {
  it("returns null when nothing is failing", () => {
    expect(pickCrisisServiceId([{ id: "a", status: "healthy" }], [])).toBeNull();
  });

  it("prefers a down service over a degraded one when there are no incidents", () => {
    expect(pickCrisisServiceId(services, [])).toBe("srv-api-gw");
  });

  it("prefers the highest incident severity over the service status", () => {
    const incidents = [
      { service_id: "srv-payment", severity: "P1_CRITICAL" as const },
      { service_id: "srv-api-gw", severity: "P3_MEDIUM" as const },
    ];
    expect(pickCrisisServiceId(services, incidents)).toBe("srv-payment");
  });
});

describe("deskGridPosition", () => {
  it("places known services on their slots and ignores unknown ones", () => {
    const ids = ["srv-auth", "srv-payment"];
    expect(deskGridPosition("srv-auth", ids)).not.toBeNull();
    expect(deskGridPosition("nope", ids)).toBeNull();
  });
});
