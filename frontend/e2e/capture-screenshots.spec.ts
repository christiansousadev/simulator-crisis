import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { BACKEND_URL } from "../playwright.config";
import { resetSession } from "./helpers";

const SCREENSHOTS_DIR = path.resolve(process.cwd(), "../docs/screenshots");
// [core_competency, assigned service]: specialists, so both run at full effect
const STAFF: ReadonlyArray<readonly [string, string]> = [
  ["auth", "srv-auth"],
  ["payments", "srv-payment"],
];

async function setupLang(page: Page, lang: "en" | "pt-BR") {
  await page.addInitScript((l: string) => {
    try {
      localStorage.setItem("incidentzero.language", l);
      localStorage.setItem("incidentzero.onboarding_seen", "true");
    } catch {
      // storage unavailable in initial context
    }
  }, lang);
}

test.describe("Capture UI Screenshots", () => {
  for (const lang of ["en", "pt-BR"] as const) {
    const suffix = lang === "pt-BR" ? "-pt" : "";

    test(`capture screenshots for ${lang}`, async ({ page, request }) => {
      test.setTimeout(240_000);
      await resetSession(request, { difficulty: "intern", pause: true });
      // a living office: two engineers on the books, hired onto their own specialty's service. They
      // walk in through reception and sit down at their desks (the hop timers run while paused).
      for (const [competency, serviceId] of STAFF) {
        const hired = await request.post(`${BACKEND_URL}/api/staff/hire`, {
          data: { core_competency: competency, assigned_service_id: serviceId },
        });
        expect(hired.ok()).toBeTruthy();
      }
      await setupLang(page, lang);
      await page.setViewportSize({ width: 1600, height: 1000 });

      // 0. Title Screen
      await page.goto("/");
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `title-screen${suffix}.png`) });

      // Enter Office
      const primaryBtn = page.getByTestId("title-primary").or(page.getByRole("button", { name: /Continue|Start|Iniciar|Continuar/i })).first();
      await primaryBtn.click();
      await page.getByTestId("title-screen").waitFor({ state: "detached" });
      await page.locator('[data-tour="office-canvas"]').waitFor({ state: "visible" });
      await page.waitForTimeout(500);

      // 1. Office HUD, once both engineers are seated and typing at lit monitors
      await page.waitForFunction(
        (n: number) => document.querySelectorAll('[data-testid="worker-typing"]').length >= n,
        STAFF.length,
        { timeout: 60_000 }
      );
      await page.waitForTimeout(800);
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
      // let the floor react: startle wave, the "!" balloons and the run toward the vault
      await page.waitForTimeout(1500);
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

      // 8. Forensic log triage CRT terminal for the live incident
      const incidentId = await page.evaluate(() => {
        // @ts-expect-error test hook exposed in dev
        const store = window.__GAME_STORE__;
        const id: string | undefined = store?.getState().telemetry.active_incidents[0]?.id;
        if (id) store.getState().openTriageTerminal(id);
        return id ?? null;
      });
      expect(incidentId).not.toBeNull();
      await page.locator("#log-triage-title").waitFor({ state: "visible" });
      // the stream types its lines in one by one: wait until the list stops growing
      let lineCount = -1;
      for (let i = 0; i < 40; i++) {
        const n = await page.locator("[data-line-id]").count();
        if (n > 1 && n === lineCount) break;
        lineCount = n;
        await page.waitForTimeout(500);
      }
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `log-triage${suffix}.png`) });
      await page.keyboard.press("Escape");
      await page.locator("#log-triage-title").waitFor({ state: "detached" });

      // 9. Guided tutorial: module 1, advanced past the welcome card to the step that spotlights the failing rack
      // (the rack picked from the incident card is deselected first, so its radial menu is not in the shot)
      await page.evaluate(() => {
        // @ts-expect-error test hook exposed in dev
        const store = window.__GAME_STORE__;
        store.getState().selectService(null);
        store.getState().openOnboarding(1);
        store.getState().patchTutorial({ stepIndex: store.getState().tutorial.stepIndex + 1 });
      });
      await page.locator("[data-tutorial-root]").waitFor({ state: "visible" });
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `tutorial${suffix}.png`) });
      await page.evaluate(() => {
        // @ts-expect-error test hook exposed in dev
        window.__GAME_STORE__.getState().closeOnboarding();
      });
      await page.locator("[data-tutorial-root]").waitFor({ state: "detached" });
      await page.waitForTimeout(300);

      // 10. Flight Academy Modal
      const helpBtn = page.getByRole("button", { name: lang === "pt-BR" ? "Ajuda e tutorial" : "Help & Tutorial" });
      if (await helpBtn.isVisible()) {
        await helpBtn.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `flight-academy${suffix}.png`) });

        // 11. Operations Glossary
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

      // 12. Post-Match Debrief Modal
      await page.evaluate(() => {
        // @ts-expect-error test hook exposed in dev
        const store = window.__GAME_STORE__;
        if (store) {
          store.setState((prev: { telemetry: Record<string, unknown> }) => ({
            telemetry: {
              ...prev.telemetry,
              status: "victory",
              sla_percentage: 99.95,
              budget: 420000,
              tick: 120,
              reputation: 92,
              tech_debt: 8,
            },
          }));
        }
      });
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `post-match-debrief${suffix}.png`) });
    });
  }
});
