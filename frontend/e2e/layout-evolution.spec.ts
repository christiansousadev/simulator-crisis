import { expect, test } from "@playwright/test";
import { BACKEND_URL } from "../playwright.config";
import { enterOffice, resetSession, withCleanLocalStorage } from "./helpers";

test.beforeEach(async ({ page, request }) => {
  await resetSession(request, { difficulty: "intern", pause: true });
  await withCleanLocalStorage(page);
});

// the HUD must keep every critical meter on screen at common laptop sizes: nothing may overflow its
// container and the three header groups must never overlap each other
for (const size of [
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1600, height: 900 },
]) {
  test(`topbar groups neither overflow nor overlap at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await enterOffice(page);
    const layout = await page.evaluate(() => {
      const header = document.querySelector("header")!;
      const groups = Array.from(header.children).map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, overflow: el.scrollWidth - el.clientWidth };
      });
      return { groups, headerOverflow: header.scrollWidth - header.clientWidth, pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    expect(layout.headerOverflow).toBeLessThanOrEqual(0);
    expect(layout.pageOverflow).toBeLessThanOrEqual(0);
    for (const group of layout.groups) expect(group.overflow).toBeLessThanOrEqual(0);
    for (let i = 1; i < layout.groups.length; i++) expect(layout.groups[i].left).toBeGreaterThanOrEqual(layout.groups[i - 1].right - 0.5);
    await expect(page.locator('[data-tour="topbar-kpis"]')).toBeVisible();
  });
}

test("service map toggle swaps the stage and lists every service", async ({ page }) => {
  await enterOffice(page);
  await page.getByRole("button", { name: "Service map" }).click();
  await expect(page.getByRole("group", { name: "Service dependency map" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Auth/i }).first()).toBeVisible();
  await page.getByRole("button", { name: "Office view" }).click();
  await expect(page.locator('[data-tour="office-canvas"]')).toBeVisible();
});

test("pinning a dock tab shows it beside the next tab", async ({ page }) => {
  await enterOffice(page);
  await page.getByRole("button", { name: "Pin this tab beside the next one" }).click();
  await page.getByRole("button", { name: /Operational Directives/i }).first().click();
  await expect(page.getByRole("button", { name: "Unpin split view" })).toBeVisible();
});

test("the help button opens the flight academy and a module starts its own tutorial", async ({ page }) => {
  await enterOffice(page);
  await page.getByRole("button", { name: "Help & Tutorial" }).click();
  const academy = page.getByRole("dialog", { name: "SRE Flight Academy" });
  await expect(academy).toBeVisible();
  await academy.getByRole("button", { name: /Start: Module 3/ }).click();
  // module 3 opens on its own first step, counted within the module (governance, CAB, war room)
  const coach = page.getByRole("dialog", { name: "Keep the SLA alive" });
  await expect(coach).toBeVisible();
  await expect(coach.getByText("Step 1 of 3")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(coach).toBeHidden();
});

test("the glossary opens from the academy and filters as you type", async ({ page }) => {
  await enterOffice(page);
  await page.getByRole("button", { name: "Help & Tutorial" }).click();
  await page.getByRole("button", { name: "Open the glossary" }).click();
  const glossary = page.getByRole("dialog", { name: "Operations Glossary" });
  await expect(glossary).toBeVisible();
  await glossary.getByRole("searchbox").fill("circuit");
  await expect(glossary.getByText("Circuit Breaker")).toBeVisible();
  await expect(glossary.getByText("MTTA (Mean Time To Acknowledge)")).toHaveCount(0);
  await glossary.getByRole("searchbox").fill("zzzz");
  await expect(glossary.getByText("No term matches that search.")).toBeVisible();
});

test("the war room tab opens on W and the canvas owns touch gestures", async ({ page }) => {
  await enterOffice(page);
  await page.keyboard.press("w");
  await expect(page.getByRole("region", { name: "War Room" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Public status page" })).toBeVisible();
  const touchAction = await page.locator('[data-tour="office-canvas"]').evaluate((el) => getComputedStyle(el).touchAction);
  expect(touchAction).toBe("none");
});

test("the rack radial menu offers a quick acknowledge and an emergency throttle", async ({ page, request }) => {
  const incident = await request.post(`${BACKEND_URL}/api/tutorial/incident`);
  expect(incident.ok()).toBeTruthy();
  await enterOffice(page);
  await page.locator('[data-rack-service-id="srv-notify"]').first().click({ force: true });
  const ack = page.getByRole("button", { name: "ACK NOW" });
  await expect(ack).toBeVisible();
  await expect(page.getByRole("button", { name: "THROTTLE" })).toBeVisible();
  await ack.dispatchEvent("click");
  await expect
    .poll(async () => {
      const state = await (await request.get(`${BACKEND_URL}/api/session/state`)).json();
      return (state.active_incidents as Array<{ status: string }>)[0]?.status;
    })
    .toBe("acknowledged");
});
