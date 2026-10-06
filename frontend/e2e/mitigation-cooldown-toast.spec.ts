import { expect, test } from "@playwright/test";
import { BACKEND_URL } from "../playwright.config";
import { enterOffice, resetSession, withCleanLocalStorage } from "./helpers";

// regression coverage for the mitigation guard rails, exercised through the real UI and API:
// 1. apply_mitigation enforces its cooldown on the SERVER (a scripted client could otherwise fire
//    any runbook every tick), and the rejection text is the real reason, never a budget complaint.
// 2. a runbook needs an open incident on its target: the UI no longer offers it on a healthy
//    service, and the server refuses it too.
// Since every REST command now pushes a fresh telemetry frame (even while paused), the card
// reacts to the cooldown immediately, so the second attempt is checked on the card (disabled,
// no budget wording) and against the API directly (the authoritative message).
test.beforeEach(async ({ page, request }) => {
  await resetSession(request, { difficulty: "intern", pause: true });
  await withCleanLocalStorage(page);
});

test("a runbook on a healthy service is refused and the card explains why", async ({ page, request }) => {
  await enterOffice(page);
  await page.locator('[data-service-id="srv-auth"]').click({ force: true });
  await page.getByRole("button", { name: /Operational Directives/i }).click();
  await expect(page.locator('[data-tour="runbook-rollback"]')).toBeDisabled();

  const response = await request.post(`${BACKEND_URL}/api/mitigations/execute`, {
    data: { action_id: "rollback", service_id: "srv-auth" },
  });
  expect(response.status()).toBe(400);
  expect(JSON.stringify(await response.json())).toMatch(/no open incident/i);
});

test("firing a runbook shows its toast, then the cooldown is enforced and never reads as a budget complaint", async ({
  page,
  request,
}) => {
  const incident = await request.post(`${BACKEND_URL}/api/tutorial/incident`);
  expect(incident.ok()).toBeTruthy();

  await enterOffice(page);

  // force: true -- the office scene keeps several small CSS animations running continuously
  // (idle bob, eye blink) even while the simulation itself is paused, which trips Playwright's
  // "is this element still moving" pre-click stability check even though the desk's own position
  // never actually changes; a real click at this element is exactly what a player's click does.
  await page.locator('[data-service-id="srv-notify"]').click({ force: true });
  await page.getByRole("button", { name: /Operational Directives/i }).click();

  const rollback = page.locator('[data-tour="runbook-rollback"]');
  await expect(rollback).toBeEnabled();

  await rollback.click();
  await expect(page.getByTestId("floating-text").last()).toContainText("Rollback Canary");

  // the paused UI now reflects the server state at once: the runbook is on cooldown
  await expect(rollback).toBeDisabled();
  await expect(rollback).not.toContainText(/budget/i);

  // and the server itself rejects a repeat with the real reason
  const repeat = await request.post(`${BACKEND_URL}/api/mitigations/execute`, {
    data: { action_id: "rollback", service_id: "srv-notify" },
  });
  expect(repeat.status()).toBe(400);
  const detail = JSON.stringify(await repeat.json());
  expect(detail).toMatch(/cooldown/i);
  expect(detail).not.toMatch(/budget/i);
});
