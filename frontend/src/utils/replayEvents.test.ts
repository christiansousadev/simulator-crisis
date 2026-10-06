import { describe, expect, it } from "vitest";
import { eventLabel, prettifyEventType, replayEventMeta } from "./replayEvents";

describe("replay event presentation", () => {
  it("maps known events and falls back for unknown ones", () => {
    expect(replayEventMeta("ROOT_CAUSE_IDENTIFIED", true).tone).toBe("success");
    expect(replayEventMeta("UNATTENDED_ALERT_VIOLATION", false).tone).toBe("critical");
    expect(replayEventMeta("SOMETHING_NEW", false).tone).toBe("warning");
    expect(replayEventMeta("SOMETHING_NEW", true).tone).toBe("info");
  });

  it("prettifies raw names when there is no translation", () => {
    expect(prettifyEventType("SOME_NEW_EVENT")).toBe("Some new event");
    expect(eventLabel("INCIDENT_RAISED", { INCIDENT_RAISED: "Incident raised" })).toBe("Incident raised");
    expect(eventLabel("OTHER_THING", {})).toBe("Other thing");
  });
});
