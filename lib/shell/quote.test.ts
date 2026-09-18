import { describe, expect, it } from "vitest";

import { quotePosix } from "./quote";

describe("quotePosix", () => {
  it("packt in einfache Anführungszeichen", () => {
    expect(quotePosix("claude")).toBe("'claude'");
  });

  it("lässt Leerzeichen und Umlaute unangetastet im Wort", () => {
    expect(quotePosix("Befolge die Anweisungen")).toBe(
      "'Befolge die Anweisungen'",
    );
    expect(quotePosix("fürs Glossar")).toBe("'fürs Glossar'");
  });

  it("bricht innere Apostrophe so aus, dass die Shell ein Wort sieht", () => {
    expect(quotePosix("a'b")).toBe("'a'\\''b'");
    expect(quotePosix("it's")).toBe("'it'\\''s'");
  });

  it("macht aus Metazeichen keinen zweiten Befehl", () => {
    expect(quotePosix("x; rm -rf /")).toBe("'x; rm -rf /'");
    expect(quotePosix("$(reboot)")).toBe("'$(reboot)'");
    expect(quotePosix("`id`")).toBe("'`id`'");
  });
});
