import { describe, expect, it } from "vitest";

import { libraryStateDir, settingsFile } from "./settings";

describe("maschinenlokaler Zustand", () => {
  it("liegt unter dem üblichen Ordner der Plattform", () => {
    const datei = settingsFile();
    expect(datei).toContain("Mediathek");
    expect(libraryStateDir()).toContain("Mediathek");

    if (process.platform === "darwin") {
      expect(datei).toContain("Library/Application Support");
    } else if (process.platform === "win32") {
      expect(datei.toLowerCase()).toMatch(/appdata|local/);
    }
  });
});
