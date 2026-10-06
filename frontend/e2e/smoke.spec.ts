import { expect, test } from "@playwright/test";
import { enterOffice, resetSession, titlePrimaryButton, withCleanLocalStorage } from "./helpers";

test.beforeEach(async ({ page, request }) => {
  await resetSession(request, { difficulty: "intern", pause: true });
  await withCleanLocalStorage(page);
});

test("title screen loads and its primary action drops into a rendered office with a live HUD", async ({ page }) => {
  await page.goto("/");
  await expect(titlePrimaryButton(page)).toBeVisible();
  // scoped to the title: the topbar behind it has its own icon buttons with similar names
  const title = page.getByTestId("title-screen");
  await expect(title.getByRole("button", { name: /New Game/i })).toBeVisible();
  await expect(title.getByRole("button", { name: /Hall of Fame/i })).toBeVisible();

  await enterOffice(page);

  // the office canvas and the bottom dock's default tab both rendered (the canvas nests several
  // <svg>s -- the skyline backdrop, lucide icons -- so target the main scene svg specifically)
  await expect(page.locator('[data-tour="office-canvas"] svg.relative.z-10')).toBeVisible();
  await expect(page.getByRole("button", { name: /Active Incidents/i })).toBeVisible();
  // the budget counter (CreditCounter) always renders "$<amount>"; its "Runway" caption label is
  // conditionally hidden below this HUD's own custom breakpoint, so assert on the amount instead
  await expect(page.getByText(/^\$[\d,]+$/)).toBeVisible();
});

// keyboard users must be able to reach every title entry; Enter/Space belong to the focused button
test("title screen is keyboard navigable and does not swallow Enter", async ({ page }) => {
  await page.goto("/");
  await expect(titlePrimaryButton(page)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: /Settings/i })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /Settings/i })).toBeHidden();
  // closing the dialog must leave the title in place
  await expect(page.getByTestId("title-screen")).toBeVisible();
});
