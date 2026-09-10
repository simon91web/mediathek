import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // e2e laeuft ueber Playwright, nicht ueber Vitest.
    include: ["lib/**/*.test.ts", "scripts/**/*.test.ts"],
    /*
     * Jede Datei bekommt einen eigenen Prozess: die Bibliotheks-Tests setzen
     * MEDIATHEK_LIBRARY_DIR, und lib/paths.ts liest das beim Laden einmalig.
     */
    pool: "forks",
    fileParallelism: false,
  },
  resolve: {
    alias: {
      // Das echte Paket wirft ausserhalb von React Server Components.
      "server-only": path.resolve(import.meta.dirname, "test/stubs/empty.ts"),
      "@": path.resolve(import.meta.dirname),
    },
  },
});
