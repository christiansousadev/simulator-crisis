import { expect, test } from "@playwright/test";
import { enterOffice, resetSession, withCleanLocalStorage } from "./helpers";

// regression coverage for two ping-pong bugs found in the same session:
// 1. the ball animated on an infinite CSS loop gated only by `user_happiness > 70`, with no
//    regard for whether the employee was actually at the table -- it volleyed by itself across
//    an empty table for roughly two-thirds of the patrol loop.
// 2. the table itself didn't read as a ping-pong table (a flush solid block, invisible net).
// This spec only re-verifies (1), the behavioral half -- (2) is a visual design fix with no
// meaningful DOM assertion to make; it was confirmed by hand with screenshots at the time.
test.beforeEach(async ({ page, request }) => {
  // standard/intern difficulty both start user_happiness at 96 -- well above the pingpong
  // waypoint's requiresMoraleAbove: 70 gate, so employeeB will visit it during this test
  await resetSession(request, { difficulty: "intern", pause: true });
  await withCleanLocalStorage(page);
});

test("the ping-pong ball only animates while the employee is actually at the table", async ({ page }) => {
  await enterOffice(page);

  const ball = page.locator(".animate-ball-volley");

  // immediately after arriving, employeeB is still on its first ("walk") waypoint -- the ball
  // must not be present yet. This is the crux of the regression: the old bug showed it here too.
  await expect(ball).toHaveCount(0);

  // employeeB's own dwell (5.2s) plus its walk-transition delay (1.8s) before the first arrival
  // notification fires -- give a wide margin
  await expect(async () => {
    expect(await ball.count()).toBeGreaterThan(0);
  }).toPass({ timeout: 15_000, intervals: [500] });

  // ...and it must turn back off once employeeB moves on to the sofa waypoint, not stay lit
  await expect(async () => {
    expect(await ball.count()).toBe(0);
  }).toPass({ timeout: 15_000, intervals: [500] });
});
