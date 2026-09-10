import { describe, expect, it } from "vitest";

import { fileLineOf } from "@/test/zeilen";
import { parseItemMarkdown } from "./beitrag-md";

/*
 * Zeilennummern zeigen auf die DATEI, nicht auf den Text nach dem Kopf.
 *
 * Das klingt nach einer Kleinigkeit und war eine: weil jede beitrag.md einen
 * Kopf hat, zeigte jede Meldung um dessen Höhe zu weit nach oben, und wer in
 * "npm run doktor" die genannte Zeile aufschlug, landte im Nichts. Die
 * Teil-Parser (chapters.ts, sections.ts, wikilink.ts) zählen weiterhin im
 * Body — verschoben wird einmal am Ende in beitrag-md.ts.
 */

/** Genau der Fall aus dem Nachweis: bibliothek-dev/medien/kaputter-kopf. */
const KAPUTTER_KOPF = `---
titel: [das ist kaputt
schlagworte: {auch: kaputt
dauer: gestern
---

Dieser Beitrag hat einen unlesbaren Kopf. Er muss trotzdem abspielbar sein,
der Titel kommt dann aus dem Ordnernamen.

<!-- kapitel:start -->
00:00 Anfang
01:12:00 Kapitel hinter dem Ende
00:10 Absichtlich unsortiert
00:10 Doppelte Zeit
<!-- kapitel:ende -->
`;

const VIDEO = `---
titel: Vorflugkontrolle Elios 3
dauer: "00:03:00"
---

Wie ich vor jedem Flug die Elios 3 durchgehe.

<!-- kapitel:start -->
00:00 Einleitung und Ziel
00:30 Akku prüfen
<!-- kapitel:ende -->

<!-- bezuege:start -->
- [[akku-grundlagen#00:15]] Dort erkläre ich die Messung
<!-- bezuege:ende -->
`;

const TEXT = `---
titel: Ein Messprotokoll lesen
---

Ein Messprotokoll trägt nur vier Aussagen.

## Kopfdaten prüfen

Objekt, Datum, Gerät und Prüfer.

## Akku und Spannung

Die Spannungswerte stehen als Reihe je Zelle.
`;

describe("parseItemMarkdown: Zeilennummern", () => {
  it("nennt für ein Kapitel die Dateizeile", () => {
    const parsed = parseItemMarkdown(KAPUTTER_KOPF, {
      slug: "kaputter-kopf",
      kind: "video",
      fallbackDuration: 60,
    });

    const chapter = parsed.chapters.find(
      (entry) => entry.title === "Kapitel hinter dem Ende",
    );
    expect(chapter).toBeDefined();
    expect(chapter!.sourceLine).toBe(
      fileLineOf(KAPUTTER_KOPF, "01:12:00 Kapitel hinter dem Ende"),
    );
    // Der Nachweis aus dem Fehlerbericht: Dateizeile 12, nicht 7.
    expect(chapter!.sourceLine).toBe(12);
  });

  it("nennt für einen Kapitel-Hinweis die Dateizeile", () => {
    const parsed = parseItemMarkdown(KAPUTTER_KOPF, {
      slug: "kaputter-kopf",
      kind: "video",
      fallbackDuration: 60,
    });

    const beyond = parsed.problems.find((problem) =>
      problem.message.includes("liegt hinter dem Ende"),
    );
    expect(beyond?.line).toBe(12);

    const duplicate = parsed.problems.find((problem) =>
      problem.message.includes("stehen zwei Kapitel"),
    );
    expect(duplicate?.line).toBe(
      fileLineOf(KAPUTTER_KOPF, "00:10 Doppelte Zeit"),
    );
  });

  it("verschiebt den Frontmatter-Hinweis NICHT", () => {
    /*
     * Der zählt von Anfang an in der Datei. Würde er mitverschoben, zeigte
     * er in den Body — also gerade dorthin, wo der Kopf nicht steht.
     */
    const parsed = parseItemMarkdown(KAPUTTER_KOPF, {
      slug: "kaputter-kopf",
      kind: "video",
    });
    const head = parsed.problems.find(
      (problem) => problem.kind === "frontmatter",
    );
    expect(head?.line).toBe(1);
  });

  it("nennt für einen Bezug die Dateizeile", () => {
    const parsed = parseItemMarkdown(VIDEO, {
      slug: "vorflugkontrolle-elios-3",
      kind: "video",
    });
    expect(parsed.references).toHaveLength(1);
    expect(parsed.references[0].sourceLine).toBe(
      fileLineOf(VIDEO, "[[akku-grundlagen#00:15]]"),
    );
  });

  it("nennt für einen Abschnitt eines Textbeitrags die Dateizeile", () => {
    const parsed = parseItemMarkdown(TEXT, {
      slug: "messprotokoll-lesen",
      kind: "text",
    });

    const section = parsed.chapters.find(
      (entry) => entry.title === "Akku und Spannung",
    );
    expect(section?.sourceLine).toBe(fileLineOf(TEXT, "## Akku und Spannung"));
  });

  it("bleibt richtig, wenn die Datei keinen Kopf hat", () => {
    // Ohne Kopf ist der Versatz null — und darf nichts verschieben.
    const ohneKopf = "Nur Text.\n\n00:00 Anfang\n00:30 Weiter\n";
    const parsed = parseItemMarkdown(ohneKopf, {
      slug: "ohne-kopf",
      kind: "video",
    });
    expect(parsed.chapters[0].sourceLine).toBe(
      fileLineOf(ohneKopf, "00:00 Anfang"),
    );
  });

  it("verträgt CRLF und BOM im Kopf", () => {
    const mitBom =
      "﻿---\r\ntitel: Mit BOM\r\n---\r\n\r\n" +
      "<!-- kapitel:start -->\r\n00:00 Anfang\r\n<!-- kapitel:ende -->\r\n";
    const parsed = parseItemMarkdown(mitBom, {
      slug: "mit-bom",
      kind: "video",
    });
    expect(parsed.chapters[0].sourceLine).toBe(
      fileLineOf(mitBom, "00:00 Anfang"),
    );
  });
});
