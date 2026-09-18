import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { writeSettings } from "@/lib/settings";

/**
 * Legt vor dem Testlauf eine frische Bibliothek an.
 *
 * Erst wird die Entwicklungsbibliothek erzeugt (mit echten, winzigen
 * Mediendateien), dann nach e2e/.tmp-bibliothek kopiert. Die Tests dürfen
 * darin schreiben; der nächste Lauf beginnt wieder sauber.
 *
 * Bewusst ein eigenes Skript und NICHT Playwrights globalSetup: Playwright
 * startet den Webserver zuerst und führt globalSetup danach aus. Der Server
 * hätte dann die alte — oder gerade gelöschte — Bibliothek gelesen, und der
 * erste Beitrag wäre schlicht nicht da.
 */
async function main() {
  const root = process.cwd();
  const source = path.join(root, "bibliothek-dev");
  const target = path.join(root, "e2e", ".tmp-bibliothek");

  /*
   * Die maschinenlokale settings.json ist NICHT Teil der kopierten
   * Bibliothek — e2e-Läufe teilen sich dieselbe Datei mit der echten
   * Entwicklung auf dieser Maschine. Ohne diese Zeile stünde
   * platformTourSeen dort, wo der Rundgang noch nie gezeigt wurde, auf
   * false, und er öffnete sich vor JEDEM Test automatisch — sein Overlay
   * blockierte dann jeden Klick auf die eigentliche Seite. Ein Test, der den
   * Rundgang selbst prüfen will, müsste dasselbe Feld gezielt zurücksetzen.
   */
  await writeSettings({ platformTourSeen: true });

  // Fixtures nur erzeugen, wenn sie fehlen — das kostet ffmpeg-Zeit.
  try {
    await fs.access(path.join(source, "medien"));
  } catch {
    const result = spawnSync(
      "npx",
      ["tsx", "--tsconfig", "tsconfig.scripts.json", "scripts/fixtures.ts"],
      { cwd: root, stdio: "inherit", shell: process.platform === "win32" },
    );
    if (result.status !== 0) {
      throw new Error("Die Fixture-Bibliothek konnte nicht erzeugt werden.");
    }
  }

  await fs.rm(target, { recursive: true, force: true });
  await fs.cp(source, target, { recursive: true });
  // Der Index gehört nicht in die Kopie: er wird neu aufgebaut.
  await fs.rm(path.join(target, "library.json"), { force: true });

  console.log(`[e2e] Bibliothek: ${target}`);
}

void main().catch((error) => {
  console.error("[e2e] Die Bibliothek konnte nicht vorbereitet werden:");
  console.error(error);
  process.exit(1);
});
