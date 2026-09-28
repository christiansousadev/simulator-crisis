import { expect, test } from "@playwright/test";
import { enterOffice, resetSession, withCleanLocalStorage } from "./helpers";

test.beforeEach(async ({ page, request }) => {
  await resetSession(request, { difficulty: "intern", pause: true });
  await withCleanLocalStorage(page);
});

test("title screen loads and Continue drops into a rendered office with a live HUD", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Continue$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /New Game/i })).toBeVisible();

  await enterOffice(page);

  // the office canvas and the bottom dock's default tab both rendered (the canvas nests several
  // <svg>s -- the skyline backdrop, lucide icons -- so target the main scene svg specifically)
  await expect(page.locator('[data-tour="office-canvas"] svg.relative.z-10')).toBeVisible();
  await expect(page.getByRole("button", { name: /Active Incidents/i })).toBeVisible();
  // the budget counter (CreditCounter) always renders "$<amount>"; its "Runway" caption label is
  // conditionally hidden below this HUD's own custom breakpoint, so assert on the amount instead
  await expect(page.getByText(/^\$[\d,]+$/)).toBeVisible();
});
