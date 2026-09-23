import { describe, expect, it } from "vitest";

import { buildCliArgs, sendsPromptOnStdin, splitArgs } from "../src/cli";
import { filesToCopy } from "../src/install";
import { secondsInHeading, stopAfter } from "../src/seek";
import { assertToolsetVersion, buildBestandPrompt, buildPrompt, readToolsetVersion } from "../src/tasks";

describe("Auftrag", () => {
  it("nennt die Anleitung und die Notiz", () => {
    expect(buildPrompt("kapitel", "Vorflugkontrolle Elios 3")).toBe(
      "Befolge die Anweisungen in anleitungen/kapitel.md. Es geht um die Notiz Vorflugkontrolle Elios 3.",
    );
  });

  it("lässt die Notiz weg, wenn die Aufgabe keine hat", () => {
    expect(buildPrompt("vollstaendigkeit", null)).toBe(
      "Befolge die Anweisungen in anleitungen/vollstaendigkeit.md.",
    );
  });

  it("hängt die Frage unter die Anleitung", () => {
    expect(buildBestandPrompt("Wie messe ich?")).toContain("Frage:\nWie messe ich?");
  });

  it("liest version 1 und lehnt eine andere ab", () => {
    expect(readToolsetVersion("version: 1\ninbox: Inbox\n")).toBe(1);
    expect(() => assertToolsetVersion("version: 2\n")).toThrow(/version 2/);
    expect(() => assertToolsetVersion(null)).not.toThrow();
  });
});

describe("Kapitelzeit", () => {
  it("liest die Überschrift aus dem Editor", () => {
    expect(secondsInHeading("### 00:30 Akku prüfen")).toBe(30);
    expect(secondsInHeading("1:02:03 Nachbereitung")).toBe(3723);
    expect(secondsInHeading("## Kapitel")).toBeNull();
  });

  it("stoppt beim nächsten Kapitel", () => {
    expect(stopAfter(30, [0, 30, 80])).toBe(80);
    expect(stopAfter(80, [0, 30, 80])).toBeNull();
  });
});

describe("Vorlage", () => {
  it("kopiert nur fehlende Dateien", () => {
    expect(
      filesToCopy(["anleitungen/kapitel.md", "toolset.yaml"], new Set(["toolset.yaml"])),
    ).toEqual(["anleitungen/kapitel.md"]);
  });
});

describe("CLI-Argumente", () => {
  it("gibt Grok den Auftrag als Datei und ohne Netz", () => {
    expect(
      buildCliArgs(
        { cliPreset: "grok", cliBinary: "", cliExtraArgs: "" },
        "C:\\temp\\auftrag.txt",
      ),
    ).toEqual([
      "--prompt-file",
      "C:\\temp\\auftrag.txt",
      "--permission-mode",
      "acceptEdits",
      "--disable-web-search",
    ]);
    expect(sendsPromptOnStdin("grok")).toBe(false);
  });

  it("gibt Claude den Auftrag über stdin", () => {
    expect(
      buildCliArgs({ cliPreset: "claude", cliBinary: "", cliExtraArgs: "--model x" }, "x"),
    ).toEqual(["-p", "--permission-mode", "acceptEdits", "--model", "x"]);
    expect(sendsPromptOnStdin("claude")).toBe(true);
  });

  it("teilt Argumente an Anführungszeichen", () => {
    expect(splitArgs('--model "ein name"')).toEqual(["--model", "ein name"]);
  });
});
