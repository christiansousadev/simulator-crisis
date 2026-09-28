import { defineConfig, devices } from "@playwright/test";

// e2e/ drives the real, running app end-to-end (both servers, a real WebSocket, a real SQLite
// session) rather than mocking anything -- it exists specifically to catch the class of bug that
// unit tests structurally cannot: WanderingEmployee's interval never actually advancing, the
// ping-pong ball desyncing from the character's real position, a wheel-zoom handler whose
// preventDefault() was silently a no-op. Every spec here started life as an ad-hoc manual
// Playwright check during a debugging session; this file is where that verification work stays
// instead of being thrown away once the bug is fixed.
export const FRONTEND_PORT = 5173;
export const BACKEND_PORT = 8000;
export const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  // specs share one live backend session (each resets it in its own beforeEach), so they must
  // not run concurrently against each other
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: "retain-on-failure",
    // this HUD has its own "hd" Tailwind breakpoint (1400px) that hides several labels below it
    // (Topbar.tsx) -- the game targets desktop, so test at a representative desktop width rather
    // than Playwright's narrower 1280x720 default, which would silently skip that whole layer
    viewport: { width: 1600, height: 1000 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // both servers must already have their dependencies installed (npm ci / pip install -r
  // requirements.txt) and, for the backend, its virtualenv active if using one locally -- exactly
  // the same prerequisite the README's "Testing & CI" section already states for pytest.
  webServer: [
    {
      command: "npm run dev -- --port 5173 --strictPort",
      url: `http://localhost:${FRONTEND_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "python -m uvicorn app.main:app --host 127.0.0.1 --port 8000",
      cwd: "../backend",
      url: `${BACKEND_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
