import { describe, expect, it } from "vitest";

import { fileLineOf } from "@/test/zeilen";
import { parseQuestionMarkdown } from "./questions";
import { renderQuestionMarkdown } from "./write-question";

const FRAGE = `---
frage: Wie lese ich die Trajectory-Datei?
auch gefragt:
  - Was steht eigentlich in der Trajectory?
  - Trajectory-Spalten, was bedeuten die?
gefragt: 2026-09-11
quellen: [bibliothek, web]
schlagworte: [trajectory]
---

<!-- antwort:start -->
Die Trajectory enthält Position und Rotation je Zeitstempel
[[cloud-compare-1#04:25]]. Der Zeitstempel beginnt nicht bei null, das ist
der Video-Offset [[cloud-compare-1#07:10-08:00]].

Im Protokoll steht dasselbe noch einmal in Worten
[[messprotokoll-lesen#akku-und-spannung]].
<!-- antwort:ende -->
`;

describe("parseQuestionMarkdown", () => {
  it("liest Frage, Umformulierungen, Tag und Schlagworte", () => {
    const frage = parseQuestionMarkdown(FRAGE, "trajectory-lesen");
    expect(frage.question).toBe("Wie lese ich die Trajectory-Datei?");
    expect(frage.alsoAsked).toEqual([
      "Was steht eigentlich in der Trajectory?",
      "Trajectory-Spalten, was bedeuten die?",
    ]);
    expect(frage.askedAt).toBe("2026-09-11");
    expect(frage.tags).toEqual(["trajectory"]);
  });

  it("merkt sich, dass auch im Internet gelesen wurde", () => {
    expect(parseQuestionMarkdown(FRAGE, "x").usedWeb).toBe(true);
    const nurBibliothek = FRAGE.replace("[bibliothek, web]", "[bibliothek]");
    expect(parseQuestionMarkdown(nurBibliothek, "x").usedWeb).toBe(false);
  });

  it("trennt Umformulierungen NICHT am Komma", () => {
    /*
     * "Trajectory-Spalten, was bedeuten die?" ist eine Frage, nicht zwei.
     * Genau hier unterscheidet sich das Feld von den Synonymen einer
     * Themenseite, wo am Komma getrennt wird.
     */
    const frage = parseQuestionMarkdown(FRAGE, "x");
    expect(frage.alsoAsked).toContain("Trajectory-Spalten, was bedeuten die?");
  });

  it("findet die Belege im Fließtext, in ihrer Reihenfolge", () => {
    const frage = parseQuestionMarkdown(FRAGE, "x");
    expect(frage.spots.map((spot) => spot.slug)).toEqual([
      "cloud-compare-1",
      "cloud-compare-1",
      "messprotokoll-lesen",
    ]);
    expect(frage.spots[0].target).toEqual({
      kind: "zeit",
      start: 265,
      end: null,
    });
    expect(frage.spots[1].target).toEqual({
      kind: "zeit",
      start: 430,
      end: 480,
    });
    expect(frage.spots[2].target).toEqual({
      kind: "abschnitt",
      anchor: "akku-und-spannung",
    });
  });

  it("führt denselben Beleg nur einmal", () => {
    const doppelt = FRAGE.replace(
      "Im Protokoll steht dasselbe",
      "Noch einmal [[cloud-compare-1#04:25]]. Im Protokoll steht dasselbe",
    );
    const frage = parseQuestionMarkdown(doppelt, "x");
    expect(
      frage.spots.filter(
        (spot) =>
          spot.slug === "cloud-compare-1" && spot.target.kind === "zeit",
      ).length,
    ).toBe(2);
  });

  it("zählt die Zeile eines Belegs in der DATEI, nicht im Body", () => {
    const frage = parseQuestionMarkdown(FRAGE, "x");
    expect(frage.spots[2].sourceLine).toBe(
      fileLineOf(FRAGE, "messprotokoll-lesen#akku-und-spannung"),
    );
  });

  it("nimmt ohne Marker den ganzen Text als Antwort", () => {
    // Eine von Hand angelegte Datei soll nicht als leer gelten.
    const ohneMarker = `---
frage: Wozu der Video-Offset?
---

Weil die Trajectory ihre eigene Uhr hat.
`;
    const frage = parseQuestionMarkdown(ohneMarker, "video-offset");
    expect(frage.answer).toContain("eigene Uhr");
    expect(frage.problems).toEqual([]);
  });

  it("meldet eine Frage ohne Antwort", () => {
    const leer = `---
frage: Und nun?
---

<!-- antwort:start -->
<!-- antwort:ende -->
`;
    const frage = parseQuestionMarkdown(leer, "und-nun");
    expect(
      frage.problems.map((problem) => problem.message).join(" "),
    ).toContain("keine Antwort");
  });

  it("fällt ohne Kopf auf die Kennung zurück", () => {
    const frage = parseQuestionMarkdown("Einfach nur Text.", "wie-geht-das");
    expect(frage.question).toBe("Wie Geht Das");
  });
});

describe("renderQuestionMarkdown", () => {
  it("schreibt, was der Parser wieder einliest", () => {
    // Der Rundlauf ist der eigentliche Test: geschrieben wird automatisch.
    const markdown = renderQuestionMarkdown({
      question: "  Wie lese ich   die Trajectory?  ",
      answer: "Position und Rotation [[cloud-compare-1#04:25]].",
      usedWeb: true,
      askedAt: "2026-09-11",
    });

    const frage = parseQuestionMarkdown(markdown, "irgendwas");
    expect(frage.question).toBe("Wie lese ich die Trajectory?");
    expect(frage.answer).toBe(
      "Position und Rotation [[cloud-compare-1#04:25]].",
    );
    expect(frage.usedWeb).toBe(true);
    expect(frage.askedAt).toBe("2026-09-11");
    expect(frage.spots).toHaveLength(1);
    expect(frage.problems).toEqual([]);
  });

  it("zitiert einen Doppelpunkt in der Frage, statt YAML zu zerlegen", () => {
    const markdown = renderQuestionMarkdown({
      question: "Fehler: was bedeutet er?",
      answer: "Nichts Gutes.",
      askedAt: "2026-09-11",
    });
    expect(parseQuestionMarkdown(markdown, "x").question).toBe(
      "Fehler: was bedeutet er?",
    );
  });

  it("endet mit genau einem Zeilenumbruch", () => {
    const markdown = renderQuestionMarkdown({
      question: "Kurz?",
      answer: "Kurz.",
      askedAt: "2026-09-11",
    });
    expect(markdown.endsWith("ende -->\n")).toBe(true);
  });
});
