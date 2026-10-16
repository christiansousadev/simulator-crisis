import { test } from "@playwright/test";
import path from "node:path";
import { BACKEND_URL } from "../playwright.config";
import { resetSession } from "./helpers";

const SCREENSHOTS_DIR = path.resolve(process.cwd(), "../docs/screenshots");

async function setupLang(page: any, lang: "en" | "pt-BR") {
  await page.addInitScript((l: string) => {
    try {
      localStorage.setItem("incidentzero.language", l);
      localStorage.setItem("incidentzero.onboarding_seen", "true");
    } catch {}
  }, lang);
}

test.describe("Capture UI Screenshots", () => {
  for (const lang of ["en", "pt-BR"] as const) {
    const suffix = lang === "pt-BR" ? "-pt" : "";

    test(`capture screenshots for ${lang}`, async ({ page, request }) => {
      test.setTimeout(120_000);
      await resetSession(request, { difficulty: "intern", pause: true });
      await setupLang(page, lang);
      await page.setViewportSize({ width: 1600, height: 1000 });

      // Enter Office
      await page.goto("/");
      const primaryBtn = page.getByTestId("title-primary").or(page.getByRole("button", { name: /Continue|Start|Iniciar|Continuar/i })).first();
      await primaryBtn.click();
      await page.getByTestId("title-screen").waitFor({ state: "detached" });
      await page.locator('[data-tour="office-canvas"]').waitFor({ state: "visible" });
      await page.waitForTimeout(500);

      // 1. Office HUD
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `office-hud${suffix}.png`) });

      // 2. Service Map
      const mapBtn = page.getByRole("button", { name: lang === "pt-BR" ? "Mapa de serviços" : "Service map" });
      if (await mapBtn.isVisible()) {
        await mapBtn.click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `service-map${suffix}.png`) });
        const officeBtn = page.getByRole("button", { name: lang === "pt-BR" ? /Visão do escritório/i : /Office view/i });
        await officeBtn.click();
        await page.waitForTimeout(300);
      }

      // 3. War Room & Stakeholder Feed (Hotkey 'W')
      await page.keyboard.press("w");
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `war-room${suffix}.png`) });

      // 4. Mitigations Panel (Hotkey 'M')
      await page.keyboard.press("m");
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `mitigations-panel${suffix}.png`) });

      // 5. Upgrades Tree (Hotkey 'U')
      await page.keyboard.press("u");
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `upgrades-tree${suffix}.png`) });

      // 6. Active Incident on Floor
      await request.post(`${BACKEND_URL}/api/tutorial/incident`);
      await page.keyboard.press("i");
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `active-incident${suffix}.png`) });

      // 7. Incident Detail
      const incidentCard = page.locator('[data-tour="incident-card"]').first();
      if (await incidentCard.isVisible()) {
        await incidentCard.click();
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `incident-detail${suffix}.png`) });

        // Causal Chain View
        const causalBtn = page.getByRole("button", { name: lang === "pt-BR" ? /Por que falhou/i : /Why it failed/i });
        if (await causalBtn.isVisible()) {
          await causalBtn.click();
          await page.waitForTimeout(400);
          await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `incident-causal-chain${suffix}.png`) });
        }
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
      }

      // 8. Flight Academy Modal
      const helpBtn = page.getByRole("button", { name: lang === "pt-BR" ? "Ajuda e tutorial" : "Help & Tutorial" });
      if (await helpBtn.isVisible()) {
        await helpBtn.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `flight-academy${suffix}.png`) });

        // 9. Operations Glossary
        const glossaryBtn = page.getByRole("button", { name: lang === "pt-BR" ? "Abrir o glossário" : "Open the glossary" });
        if (await glossaryBtn.isVisible()) {
          await glossaryBtn.click();
          await page.waitForTimeout(400);
          await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `glossary${suffix}.png`) });
          await page.keyboard.press("Escape");
        }
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
      }
    });
  }
});
