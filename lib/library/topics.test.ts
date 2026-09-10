import { describe, expect, it } from "vitest";

import { fileLineOf } from "@/test/zeilen";
import { parseTopicMarkdown } from "./topics";

/*
 * Die Themendatei trägt zwei Ebenen in einer Datei: geordnete ganze Beiträge
 * außerhalb der Marker (handgeschrieben) und einzelne Fundstellen darin (das
 * Schreibfenster für Claude Code). Dass diese Trennung hält, ist der Kern
 * dieser Tests — sonst zählt eine Fundstelle als ganzer Beitrag und die
 * Themenseite behauptet eine Reihenfolge, die niemand so gemeint hat.
 */

const VOLL = `---
titel: Zellspannungsmessung
synonyme: [Balancing, Spannungsspreizung, Zellprüfer]
schlagworte: [akku, elektrik]
---

Warum die Zellspannung die aussagekräftigste Einzelgröße am Akku ist.
Zwei Sätze reichen.

- [[vorflugkontrolle-elios-3]]
- [[akku-grundlagen]] mit einer Anmerkung dahinter

<!-- fundstellen:start -->
- [[akku-grundlagen#00:15]] Das Messgerät und der Ablauf
- [[vorflugkontrolle-elios-3#00:30-01:20]] Im Ablauf der Vorflugkontrolle
- [[messprotokoll-lesen#akku-und-spannung]] Wie es ins Protokoll kommt
<!-- fundstellen:ende -->
`;

describe("parseTopicMarkdown", () => {
  it("liest Titel, Schlagworte und Synonyme", () => {
    const topic = parseTopicMarkdown(VOLL, "zellspannungsmessung");
    expect(topic.title).toBe("Zellspannungsmessung");
    expect(topic.tags).toEqual(["akku", "elektrik"]);
    expect(topic.synonyms).toEqual([
      "Balancing",
      "Spannungsspreizung",
      "Zellprüfer",
    ]);
  });

  it("behält die Schreibweise der Synonyme", () => {
    // Sie werden angezeigt; nur für die Suche werden sie gefaltet.
    const topic = parseTopicMarkdown(VOLL, "zellspannungsmessung");
    expect(topic.synonyms).toContain("Zellprüfer");
  });

  it("nimmt die Beiträge außerhalb der Marker in Dateireihenfolge", () => {
    const topic = parseTopicMarkdown(VOLL, "zellspannungsmessung");
    expect(topic.itemSlugs).toEqual([
      "vorflugkontrolle-elios-3",
      "akku-grundlagen",
    ]);
  });

  it("zählt eine Fundstelle NICHT als ganzen Beitrag", () => {
    const topic = parseTopicMarkdown(VOLL, "zellspannungsmessung");
    expect(topic.itemSlugs).not.toContain("messprotokoll-lesen");
    expect(topic.spots.map((spot) => spot.slug)).toContain(
      "messprotokoll-lesen",
    );
  });

  it("liest Zeit, Ausschnitt und Anker als Sprungziel", () => {
    const topic = parseTopicMarkdown(VOLL, "zellspannungsmessung");
    expect(topic.spots).toHaveLength(3);
    expect(topic.spots[0].target).toEqual({
      kind: "zeit",
      start: 15,
      end: null,
    });
    expect(topic.spots[1].target).toEqual({
      kind: "zeit",
      start: 30,
      end: 80,
    });
    expect(topic.spots[2].target).toEqual({
      kind: "abschnitt",
      anchor: "akku-und-spannung",
    });
  });

  it("nimmt alles hinter dem Verweis als Begründung", () => {
    const topic = parseTopicMarkdown(VOLL, "zellspannungsmessung");
    expect(topic.spots[0].note).toBe("Das Messgerät und der Ablauf");
  });

  it("lässt die Verweiszeilen aus der Beschreibung heraus", () => {
    const topic = parseTopicMarkdown(VOLL, "zellspannungsmessung");
    expect(topic.description).toContain("aussagekräftigste");
    expect(topic.description).not.toContain("[[");
    expect(topic.description).not.toContain("fundstellen");
  });

  it("bemängelt ein Thema ohne jeden Verweis", () => {
    const topic = parseTopicMarkdown("---\ntitel: Leer\n---\nNur Text.", "leer");
    expect(topic.problems.map((problem) => problem.kind)).toContain("bezug");
  });

  it("lässt ein Thema aus reinen Fundstellen zu", () => {
    /*
     * So sieht eine von "/themen" erzeugte Seite aus: keine geordneten
     * Beiträge, nur Stellen. Das ist kein Mangel.
     */
    const topic = parseTopicMarkdown(
      "---\ntitel: Nur Stellen\n---\n" +
        "<!-- fundstellen:start -->\n" +
        "- [[akku-grundlagen#00:15]] Hier\n" +
        "<!-- fundstellen:ende -->\n",
      "nur-stellen",
    );
    expect(topic.problems).toEqual([]);
    expect(topic.spots).toHaveLength(1);
    expect(topic.itemSlugs).toEqual([]);
  });

  it("nimmt den Slug als Titel, wenn der Kopf keinen nennt", () => {
    const topic = parseTopicMarkdown("- [[akku-grundlagen]]", "akku-und-mehr");
    expect(topic.title).toBe("Akku Und Mehr");
  });

  it("entdoppelt die geordneten Beiträge", () => {
    const topic = parseTopicMarkdown(
      "- [[akku-grundlagen]]\n- [[akku-grundlagen]] nochmal\n",
      "doppelt",
    );
    expect(topic.itemSlugs).toEqual(["akku-grundlagen"]);
  });

  it("meldet eine Zeile mit kaputten Klammern im Block", () => {
    const topic = parseTopicMarkdown(
      "---\ntitel: X\n---\n" +
        "- [[akku-grundlagen]]\n" +
        "<!-- fundstellen:start -->\n" +
        "- [[akku-grundlagen#00:15 fehlende Klammer\n" +
        "<!-- fundstellen:ende -->\n",
      "kaputt",
    );
    expect(topic.problems.map((problem) => problem.kind)).toContain("bezug");
  });

  it("zeigt die Zeile der Fundstelle bezogen auf die DATEI", () => {
    /*
     * Nicht bezogen auf den Body: eine Zeilennummer, die den Kopf nicht
     * mitzählt, kann man in keinem Editor anspringen.
     */
    const topic = parseTopicMarkdown(VOLL, "zellspannungsmessung");
    const expected = fileLineOf(VOLL, "[[akku-grundlagen#00:15]]");
    expect(expected).toBe(14);
    expect(topic.spots[0].sourceLine).toBe(expected);
  });

  it("überlebt einen nicht geschlossenen Marker", () => {
    const topic = parseTopicMarkdown(
      "- [[akku-grundlagen]]\n<!-- fundstellen:start -->\n- [[x-y#00:10]] Da\n",
      "offen",
    );
    // Kein Block erkannt, aber der geordnete Beitrag steht trotzdem da.
    expect(topic.itemSlugs).toContain("akku-grundlagen");
    expect(topic.problems.length).toBeGreaterThan(0);
  });

  it("verträgt CRLF und BOM", () => {
    const topic = parseTopicMarkdown(
      "﻿---\r\ntitel: Mit BOM\r\nsynonyme: [Alpha]\r\n---\r\n" +
        "- [[akku-grundlagen]]\r\n",
      "bom",
    );
    expect(topic.title).toBe("Mit BOM");
    expect(topic.synonyms).toEqual(["Alpha"]);
    expect(topic.itemSlugs).toEqual(["akku-grundlagen"]);
  });

  it("nimmt Synonyme auch als eine Zeile mit Kommas", () => {
    const topic = parseTopicMarkdown(
      "---\ntitel: X\nsynonyme: Balancing, Zellspannung\n---\n- [[a-b]]",
      "x",
    );
    expect(topic.synonyms).toEqual(["Balancing", "Zellspannung"]);
  });

  it("verwirft zu kurze Synonyme", () => {
    // Zwei Zeichen wären in der Suche nur Lärm.
    const topic = parseTopicMarkdown(
      "---\ntitel: X\nsynonyme: [Ah, Zellspannung]\n---\n- [[a-b]]",
      "x",
    );
    expect(topic.synonyms).toEqual(["Zellspannung"]);
  });
});
