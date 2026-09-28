import { expect, test } from "@playwright/test";
import { enterOffice, resetSession, withCleanLocalStorage } from "./helpers";

// regression coverage for a bug where the office camera's wheel-zoom handler called
// preventDefault() inside React's onWheel prop -- browsers (and React, following suit) register
// wheel/touch listeners bound through JSX event props as passive by default, so the call was
// silently a no-op and logged "Unable to preventDefault inside passive event listener invocation"
// on every scroll. Fixed by attaching a native, explicitly non-passive listener instead.
test.beforeEach(async ({ page, request }) => {
  await resetSession(request, { difficulty: "intern", pause: true });
  await withCleanLocalStorage(page);
});

test("scrolling to zoom the office camera changes scale and logs no passive-listener error", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  await enterOffice(page);

  const canvas = page.locator('[data-tour="office-canvas"]');
  const box = await canvas.boundingBox();
  if (!box) throw new Error("office canvas has no bounding box");

  const getScale = () =>
    page.evaluate(() => {
      const el = [...document.querySelectorAll<HTMLElement>('[data-tour="office-canvas"] *')].find((e) =>
        e.style.transform?.includes("scale")
      );
      return el?.style.transform ?? null;
    });

  const before = await getScale();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(200);
  const after = await getScale();

  expect(after).not.toBe(before);
  expect(consoleErrors.join("\n")).not.toContain("passive event listener");
});
