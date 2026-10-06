import { describe, expect, it } from "vitest";
import { LOUNGE_SPOTS, appearanceFor, assignSeats, bandOf, deriveIntent, planTargets, workedServiceIds } from "./rosterPlan";
import { NODE, rackStandNodeId, reserveSeatNodeId, seatNodeId } from "./waypointGraph";

type E = Parameters<typeof assignSeats>[0][number];
const eng = (id: string, service: string | null, status: E["on_call_status"] = "on_duty", hired = 0): E => ({
  id,
  assigned_service_id: service,
  on_call_status: status,
  hired_at_tick: hired,
});

describe("workedServiceIds", () => {
  it("lists services with a picked-up incident, sorted and unique", () => {
    expect(
      workedServiceIds([
        { service_id: "srv-b", status: "acknowledged" },
        { service_id: "srv-a", status: "mitigated" },
        { service_id: "srv-b", status: "acknowledged" },
        { service_id: "srv-c", status: "active" },
      ])
    ).toEqual(["srv-a", "srv-b"]);
  });
});

describe("deriveIntent", () => {
  const worked = new Set(["srv-auth"]);
  it("sends resting and off-duty engineers to the lounge", () => {
    expect(deriveIntent(eng("e", "srv-auth", "resting"), worked)).toBe("lounge");
    expect(deriveIntent(eng("e", "srv-auth", "off_duty"), worked)).toBe("lounge");
  });
  it("sends an on-duty engineer to the vault only when their own service is being worked", () => {
    expect(deriveIntent(eng("e", "srv-auth"), worked)).toBe("incident");
    expect(deriveIntent(eng("e", "srv-payment"), worked)).toBe("desk");
    expect(deriveIntent(eng("e", null), worked)).toBe("desk");
  });
});

describe("assignSeats", () => {
  it("gives the service desk to the oldest hire on that service and reserve desks to everyone else", () => {
    const seats = assignSeats([eng("late", "srv-auth", "on_duty", 9), eng("early", "srv-auth", "on_duty", 1), eng("free", null, "on_duty", 3)]);
    expect(seats.get("early")).toBe(seatNodeId("srv-auth"));
    expect(seats.get("late")).toBe(reserveSeatNodeId(1));
    expect(seats.get("free")).toBe(reserveSeatNodeId(0));
  });

  it("falls back to reserve desks for a service without a desk, then to no seat", () => {
    const seats = assignSeats([
      eng("a", "srv-unknown", "on_duty", 1),
      eng("b", null, "on_duty", 2),
      eng("c", null, "on_duty", 3),
      eng("d", null, "on_duty", 4),
    ]);
    expect(seats.get("a")).toBe(reserveSeatNodeId(0));
    expect(seats.get("c")).toBe(reserveSeatNodeId(2));
    expect(seats.get("d")).toBeNull();
  });

  it("does not shuffle seats when the roster order changes", () => {
    const a = assignSeats([eng("x", "srv-auth", "on_duty", 1), eng("y", "srv-payment", "on_duty", 2)]);
    const b = assignSeats([eng("y", "srv-payment", "on_duty", 2), eng("x", "srv-auth", "on_duty", 1)]);
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });
});

describe("planTargets", () => {
  it("plans a desk, the vault and the lounge", () => {
    const targets = planTargets(
      [
        eng("desk", "srv-auth", "on_duty", 1),
        eng("vault", "srv-payment", "on_duty", 2),
        eng("rest", "srv-api-gw", "resting", 3),
        eng("rest2", null, "off_duty", 4),
      ],
      new Set(["srv-payment"])
    );
    const byId = Object.fromEntries(targets.map((t) => [t.id, t]));
    expect(byId.desk).toMatchObject({ nodeId: seatNodeId("srv-auth"), place: "desk", serviceId: "srv-auth" });
    expect(byId.vault).toMatchObject({ nodeId: rackStandNodeId("srv-payment"), place: "server" });
    expect(byId.rest).toMatchObject({ nodeId: LOUNGE_SPOTS[0].nodeId, place: "lounge", mug: true });
    expect(byId.rest2).toMatchObject({ nodeId: LOUNGE_SPOTS[1].nodeId, place: "lounge", mug: false });
  });

  it("returns an engineer to their desk once the incident is no longer being worked", () => {
    const roster = [eng("a", "srv-auth")];
    expect(planTargets(roster, new Set(["srv-auth"]))[0].place).toBe("server");
    expect(planTargets(roster, new Set())[0]).toMatchObject({ place: "desk", nodeId: seatNodeId("srv-auth") });
  });

  it("sends a seatless engineer to the lounge and plans nothing for an empty roster", () => {
    const crowd = [eng("a", null, "on_duty", 1), eng("b", null, "on_duty", 2), eng("c", null, "on_duty", 3), eng("d", null, "on_duty", 4)];
    expect(planTargets(crowd, new Set())[3].place).toBe("lounge");
    expect(planTargets([], new Set())).toEqual([]);
  });

  it("keeps the lounge spots on real graph nodes", () => {
    expect(LOUNGE_SPOTS.map((s) => s.nodeId)).toContain(NODE.loungeCoffee);
  });
});

describe("bandOf", () => {
  it("splits the engineering bay between the desk rows and gives the lounge its own layer", () => {
    expect(bandOf(10.4, 1.8)).toBe("w0");
    expect(bandOf(9.75, 4.9)).toBe("w1");
    expect(bandOf(9.75, 6.95)).toBe("w2");
    expect(bandOf(18.2, 14)).toBe("w2");
    expect(bandOf(9.75, 10.05)).toBe("lounge");
    expect(bandOf(3.9, 4.05)).toBe("w1");
  });
});

describe("appearanceFor", () => {
  it("is stable per engineer and varies across engineers", () => {
    expect(appearanceFor("eng-1a2b3c")).toEqual(appearanceFor("eng-1a2b3c"));
    const looks = new Set(Array.from({ length: 12 }, (_, i) => appearanceFor(`eng-${i}`).shirtColor));
    expect(looks.size).toBeGreaterThan(2);
  });
});
