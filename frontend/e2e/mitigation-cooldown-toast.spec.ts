import { expect, test } from "@playwright/test";
import { enterOffice, resetSession, withCleanLocalStorage } from "./helpers";

// regression coverage for two bugs from the same debugging session:
// 1. apply_mitigation had no server-side cooldown at all (a scripted client could fire any
//    runbook every tick) -- fixed by tracking mitigation_last_fired_tick server-side.
// 2. every action-rejection toast in the frontend showed one hardcoded string ("insufficient
//    budget") regardless of the backend's actual reason, so a cooldown rejection read as a
//    budget complaint -- fixed by surfacing err.message from the real API response.
// This spec exercises both through the real UI: paused at tick 0, firing a cheap runbook twice
// back-to-back is deterministic (no race with real-time ticking, no need to wait out a cooldown).
test.beforeEach(async ({ page, request }) => {
  await resetSession(request, { difficulty: "intern", pause: true });
  await withCleanLocalStorage(page);
});

test("firing the same runbook twice in a row surfaces the real cooldown message, not a budget complaint", async ({
  page,
}) => {
  await enterOffice(page);

  // force: true -- the office scene keeps several small CSS animations running continuously
  // (idle bob, eye blink) even while the simulation itself is paused, which trips Playwright's
  // "is this element still moving" pre-click stability check even though the desk's own position
  // never actually changes; a real click at this element is exactly what a player's click does.
  await page.locator('[data-service-id="srv-auth"]').click({ force: true });
  await page.getByRole("button", { name: /Operational Directives/i }).click();

  const rollback = page.getByRole("button", { name: /Rollback Canary/i });
  await expect(rollback).toBeEnabled();

  await rollback.click();
  await expect(page.getByTestId("floating-text").last()).toContainText("Rollback Canary");

  // fired again immediately: the client's own cooldown timer hasn't caught up yet (it only
  // updates from the next telemetry tick), so this click still reaches the backend for real
  await rollback.click();
  const secondToast = page.getByTestId("floating-text").last();
  await expect(secondToast).toHaveAttribute("data-tone", "danger");
  await expect(secondToast).toContainText(/cooldown/i);
  await expect(secondToast).not.toContainText(/budget/i);
});
