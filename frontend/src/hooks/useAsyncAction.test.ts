import { afterEach, describe, expect, it } from "vitest";
import { useGameStore } from "../store/useGameStore";
import { clearPending, isActionPending, runExclusive } from "./useAsyncAction";

afterEach(() => clearPending("k"));

describe("runExclusive", () => {
  it("ignores a second run while the first is still pending (no double submit)", async () => {
    let calls = 0;
    let release: () => void = () => {};
    const slow = () =>
      new Promise<void>((resolve) => {
        calls += 1;
        release = resolve;
      });
    const first = runExclusive("k", slow);
    expect(isActionPending("k")).toBe(true);
    const second = await runExclusive("k", slow);
    expect(second).toBeUndefined();
    expect(calls).toBe(1);
    release();
    await first;
    expect(isActionPending("k")).toBe(false);
  });

  it("stays pending after the request until the confirming store update arrives", async () => {
    useGameStore.setState({ dockTab: "incidents" });
    await runExclusive("k", async () => "ok", { confirmed: (s) => s.dockTab === "metrics" });
    expect(isActionPending("k")).toBe(true);
    useGameStore.setState({ dockTab: "metrics" });
    expect(isActionPending("k")).toBe(false);
    useGameStore.setState({ dockTab: "incidents" });
  });

  it("clears pending and reports the error when the request fails", async () => {
    let seen: unknown = null;
    const result = await runExclusive(
      "k",
      async () => {
        throw new Error("No open incident on this service");
      },
      { onError: (e) => (seen = e) }
    );
    expect(result).toBeUndefined();
    expect((seen as Error).message).toBe("No open incident on this service");
    expect(isActionPending("k")).toBe(false);
  });
});
