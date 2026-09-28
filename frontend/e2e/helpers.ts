import type { APIRequestContext, Page } from "@playwright/test";
import { BACKEND_URL } from "../playwright.config";

// resets the live backend session to a known, deterministic state via its own REST API -- the
// same session/reset + /pause + /speed calls used to stage every manual verification this suite
// grew out of. Pass `pause: true` to freeze the tick loop immediately after reset, when a test
// needs to control exactly when the simulation advances rather than racing real time.
export async function resetSession(
  request: APIRequestContext,
  opts: { difficulty?: "intern" | "standard" | "chaos"; pause?: boolean } = {}
): Promise<void> {
  await request.post(`${BACKEND_URL}/api/session/reset`, {
    data: { difficulty: opts.difficulty ?? null },
  });
  if (!opts.pause) return;
  // reset() restarts the tick loop internally via asyncio.create_task -- a pause issued
  // immediately afterward can race that restart and be overwritten, leaving the engine still
  // ticking. Poll pause+confirm rather than trusting a single call (a live tick loop would keep
  // advancing tick/state throughout a test that expects a frozen baseline, and can also make
  // Playwright's actionability checks see a moving target).
  for (let attempt = 0; attempt < 5; attempt++) {
    await request.post(`${BACKEND_URL}/api/session/pause`);
    const state = await getSessionState(request);
    if (state.is_running === false) return;
  }
  throw new Error("resetSession: could not confirm the engine paused after 5 attempts");
}

export async function getSessionState(request: APIRequestContext): Promise<Record<string, unknown>> {
  const resp = await request.get(`${BACKEND_URL}/api/session/state`);
  return resp.json();
}

// English + a fresh onboarding-seen flag, so every spec starts from the same title screen
// regardless of what a previous manual session left in this browser's localStorage
export async function withCleanLocalStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("incidentzero.language", "en");
      localStorage.setItem("incidentzero.onboarding_seen", "true");
    } catch {
      // ignore -- a private/blocked-storage context just means onboarding shows once
    }
  });
}

// navigates in, dismisses the title screen via "Continue", and waits for the office HUD to render
export async function enterOffice(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: /^Continue$/ }).click();
  await page.locator('[data-tour="office-canvas"]').waitFor({ state: "visible" });
}
