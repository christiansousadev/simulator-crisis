import { expect, test } from "@playwright/test";
import { BACKEND_URL } from "../playwright.config";
import { enterOffice, resetSession, withCleanLocalStorage } from "./helpers";

// regression: the incident card is one big "stretched" button (its ::after covers the card). The
// global press-squash (`button:active { transform: scale(.96) }`) turned that button into the
// containing block of its own pseudo-element, so the clickable area shrank to the button's small
// box the instant the mouse went down and a click anywhere else on the card never fired. Clicking
// the BODY of the card (not only its title) must open the incident briefing, every time.
test.beforeEach(async ({ page, request }) => {
  await resetSession(request, { difficulty: "intern", pause: true });
  await withCleanLocalStorage(page);
});

test("clicking the body of an incident card opens its briefing, repeatedly", async ({ page, request }) => {
  const incident = await request.post(`${BACKEND_URL}/api/tutorial/incident`);
  expect(incident.ok()).toBeTruthy();
  await enterOffice(page);

  const card = page.locator('[data-tour="incident-card"]').first();
  await expect(card).toBeVisible();
  // the dock slides in for ~1.3 s after the title is dismissed: wait until the card stops moving
  // before measuring, or the click lands where the card used to be
  let box = await card.boundingBox();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150);
    const next = await card.boundingBox();
    if (next && box && next.x === box.x && next.y === box.y && next.height === box.height) break;
    box = next;
  }
  if (!box) throw new Error("incident card has no layout box");

  // a point well below the title row and away from the Acknowledge button
  const bodyPoint = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.4 };

  for (let attempt = 0; attempt < 2; attempt++) {
    await page.mouse.click(bodyPoint.x, bodyPoint.y);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  }
});
