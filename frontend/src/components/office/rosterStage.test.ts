import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECK_IN_PAUSE_MS, RosterChoreographer, WalkerTarget, WalkerView } from "./rosterStage";
import { NODE, OFFICE_GRAPH, rackStandNodeId, seatNodeId } from "./waypointGraph";

function setup() {
  let views: WalkerView[] = [];
  let occupied = false;
  let checkIns = 0;
  const history: string[] = [];
  const stage = new RosterChoreographer(OFFICE_GRAPH, {
    publish: (v, o) => {
      views = v;
      occupied = o;
      for (const view of v) history.push(`${view.id}:${view.nodeId}`);
    },
    checkIn: () => {
      checkIns++;
    },
  });
  return {
    stage,
    view: (id: string) => views.find((v) => v.id === id),
    occupied: () => occupied,
    checkIns: () => checkIns,
    history,
  };
}

const target = (id: string, nodeId: string, over: Partial<WalkerTarget> = {}): WalkerTarget => ({
  id,
  nodeId,
  place: "desk",
  mug: false,
  fresh: false,
  ...over,
});

describe("RosterChoreographer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("seats an engineer already on the books straight at their desk", () => {
    const s = setup();
    s.stage.sync([target("e1", seatNodeId("srv-auth"))], { instant: false });
    expect(s.view("e1")).toMatchObject({ nodeId: seatNodeId("srv-auth"), seated: true, place: "desk" });
  });

  it("teleports everyone to their spot when motion is reduced, even a new hire", () => {
    const s = setup();
    s.stage.sync([target("e1", seatNodeId("srv-auth"), { fresh: true })], { instant: true });
    expect(s.view("e1")).toMatchObject({ nodeId: seatNodeId("srv-auth"), seated: true });
    s.stage.sync([target("e1", NODE.loungeCoffee, { place: "lounge", mug: true })], { instant: true });
    expect(s.view("e1")).toMatchObject({ nodeId: NODE.loungeCoffee, seated: false, mug: true });
  });

  it("walks a new hire in from reception, pausing to check in, then sits them down", () => {
    const s = setup();
    s.stage.sync([target("e1", seatNodeId("srv-auth"), { fresh: true })], { instant: false });
    expect(s.view("e1")).toMatchObject({ nodeId: NODE.entrance, place: "entering", seated: false });

    // reaches the reception desk and checks in
    for (let t = 0; t < 20_000 && s.checkIns() === 0; t += 50) vi.advanceTimersByTime(50);
    expect(s.checkIns()).toBe(1);
    expect(s.view("e1")?.nodeId).toBe(NODE.receptionFront);

    // after the check-in pause the walk to the desk resumes and ends seated
    vi.advanceTimersByTime(CHECK_IN_PAUSE_MS + 60_000);
    expect(s.view("e1")).toMatchObject({ nodeId: seatNodeId("srv-auth"), seated: true, place: "desk" });
    expect(s.checkIns()).toBe(1);
  });

  it("visits every node of the path in order, one hop at a time", () => {
    const s = setup();
    s.stage.sync([target("e1", seatNodeId("srv-auth"))], { instant: false });
    s.stage.sync([target("e1", rackStandNodeId("srv-auth"), { place: "server" })], { instant: false });
    vi.advanceTimersByTime(120_000);
    const visited = s.history.filter((h) => h.startsWith("e1:")).map((h) => h.slice(3));
    const unique = visited.filter((id, i) => id !== visited[i - 1]);
    expect(unique[0]).toBe(seatNodeId("srv-auth"));
    expect(unique).toContain(NODE.serverRoomDoor);
    expect(unique[unique.length - 1]).toBe(rackStandNodeId("srv-auth"));
    expect(s.view("e1")).toMatchObject({ seated: false, place: "server" });
    expect(s.occupied()).toBe(true);
  });

  it("stands up when it leaves its desk and sits again when it comes back", () => {
    const s = setup();
    s.stage.sync([target("e1", seatNodeId("srv-auth"))], { instant: false });
    s.stage.sync([target("e1", NODE.loungeCoffee, { place: "lounge", mug: true })], { instant: false });
    vi.advanceTimersByTime(500);
    expect(s.view("e1")?.seated).toBe(false);
    vi.advanceTimersByTime(120_000);
    expect(s.view("e1")).toMatchObject({ nodeId: NODE.loungeCoffee, place: "lounge", mug: true });
    s.stage.sync([target("e1", seatNodeId("srv-auth"))], { instant: false });
    vi.advanceTimersByTime(120_000);
    expect(s.view("e1")).toMatchObject({ nodeId: seatNodeId("srv-auth"), seated: true, place: "desk", mug: false });
    expect(s.occupied()).toBe(false);
  });

  it("swaps painter layers while standing still, never mid-hop", () => {
    const s = setup();
    s.stage.sync([target("e1", seatNodeId("srv-auth"))], { instant: false });
    s.stage.sync([target("e1", NODE.loungeSofaA, { place: "lounge" })], { instant: false });
    const handoffs: number[] = [];
    let last = s.view("e1")!.band;
    for (let t = 0; t < 120_000; t += 20) {
      vi.advanceTimersByTime(20);
      const v = s.view("e1")!;
      if (v.band !== last) {
        handoffs.push(v.hopMs);
        last = v.band;
      }
    }
    expect(handoffs.length).toBeGreaterThan(0);
    expect(handoffs.every((ms) => ms === 0)).toBe(true);
    expect(s.view("e1")?.band).toBe("lounge");
  });

  it("re-plans from where the sprite is when the target changes mid-walk", () => {
    const s = setup();
    s.stage.sync([target("e1", seatNodeId("srv-auth"))], { instant: false });
    s.stage.sync([target("e1", NODE.loungeCoffee, { place: "lounge" })], { instant: false });
    vi.advanceTimersByTime(3000);
    s.stage.sync([target("e1", seatNodeId("srv-payment"))], { instant: false });
    vi.advanceTimersByTime(180_000);
    expect(s.view("e1")).toMatchObject({ nodeId: seatNodeId("srv-payment"), seated: true });
  });

  it("removes engineers that left the roster and clears its timers on dispose", () => {
    const s = setup();
    s.stage.sync([target("e1", seatNodeId("srv-auth")), target("e2", seatNodeId("srv-payment"))], { instant: false });
    s.stage.sync([target("e2", seatNodeId("srv-payment"))], { instant: false });
    expect(s.view("e1")).toBeUndefined();
    s.stage.sync([target("e2", NODE.loungeCoffee, { place: "lounge" })], { instant: false });
    s.stage.dispose();
    expect(s.view("e2")).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});
