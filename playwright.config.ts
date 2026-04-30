import { defineConfig, devices } from "@playwright/test";

/**
 * E2E coverage for the public surface — landing redirect, login, signup,
 * legal pages, locale switching, cookie banner. Auth-gated paths
 * (dashboard, wizard, results) are intentionally NOT exercised here:
 * they require Supabase + LLM credentials and the simulation engine
 * costs money to run. Add those as integration tests with a seeded
 * test workspace later, not in this hermetic suite.
 *
 * Run locally:  npm run e2e
 * Run UI mode:  npm run e2e:ui
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    // Pin the browser locale to Korean so next-intl's Accept-Language
    // negotiation always serves the ko variant by default. Tests that
    // need to assert the en variant should navigate to /en/* explicitly.
    locale: "ko-KR",
    extraHTTPHeaders: {
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.5",
    },
  },

  // One browser is plenty for v0.1 smoke. Add firefox/webkit when we
  // start hitting cross-browser bugs in production.
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Spin the dev server automatically when running locally; in CI the
  // workflow boots a production build separately for realism.
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
