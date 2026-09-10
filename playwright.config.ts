import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/**
 * Die Tests laufen gegen eine KOPIE der Fixture-Bibliothek: sie dürfen
 * schreiben (Editor, Import), die Vorlage bleibt sauber.
 *
 * process.cwd() statt import.meta.dirname: Playwright lädt diese Datei als
 * CommonJS, dort gibt es kein import.meta. Aufgerufen wird immer aus der
 * Projektwurzel.
 */
const LIBRARY = path.join(process.cwd(), "e2e", ".tmp-bibliothek");
const PORT = 3210;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    trace: "retain-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: `npx next dev -H 127.0.0.1 -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/bibliothek`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      MEDIATHEK_LIBRARY_DIR: LIBRARY,
      // Der Poller muss im Test schnell genug sein.
      MEDIATHEK_POLL_MS: "5000",
    },
  },
});
