import { expect, test } from "@playwright/test";
import { enterOffice, resetSession, withCleanLocalStorage } from "./helpers";

// regression coverage for a bug where every WanderingEmployee (the break room's two NPCs, the
// corridor patroller) stood frozen at its first waypoint for the entire session: the patrol
// interval closed over the reactive `user_happiness` value, which drifts on nearly every tick
// broadcast, so the interval was torn down and recreated before its dwellMs could ever elapse.
// WanderingEmployee's cycle is a plain client-side setInterval, independent of whether the
// backend simulation is ticking -- so this only needs a connected session, not an unpaused one.
test.beforeEach(async ({ page, request }) => {
  await resetSession(request, { difficulty: "intern", pause: true });
  await withCleanLocalStorage(page);
});

test("at least one ambient office employee actually walks between waypoints", async ({ page }) => {
  await enterOffice(page);

  const walking = page.locator(".animate-walk-cycle-left, .animate-walk-cycle-right");

  // the shortest configured dwell is 4.5s (BreakRoom's employeeA); give a generous margin for
  // the walk transition on top of that before concluding nothing ever moved
  await expect(async () => {
    expect(await walking.count()).toBeGreaterThan(0);
  }).toPass({ timeout: 12_000, intervals: [500] });
});
