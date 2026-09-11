import { describe, expect, it } from "vitest";

import { fileLineOf } from "@/test/zeilen";
import { parseCollectionMarkdown } from "./collections";
import { renderCollectionMarkdown } from "./write-collection";

const PFAD = `---
titel: Alles zum Akku
schlagworte: [akku]
---

Was ich einem neuen Kollegen zum Akku zeigen würde, in dieser Folge.

- [[akku-grundlagen#00:15-00:50]] Messen mit dem Zellprüfer
- [[vorflugkontrolle-elios-3#00:30]] Im Ablauf der Vorflugkontrolle
- [[messprotokoll-lesen#akku-und-spannung]] Wie es ins Protokoll kommt
`;

describe("parseCollectionMarkdown", () => {
  it("liest Titel, Beschreibung und Schlagworte", () => {
    const collection = parseCollectionMarkdown(PFAD, "alles-zum-akku");
    expect(collection.title).toBe("Alles zum Akku");
    expect(collection.description).toContain("neuen Kollegen");
    expect(collection.tags).toEqual(["akku"]);
  });

  it("behält die Reihenfolge der Datei", () => {
    // Sie ist die Reihenfolge der Wiedergabe — daran hängt der Sinn.
    const collection = parseCollectionMarkdown(PFAD, "alles-zum-akku");
    expect(collection.entries.map((entry) => entry.slug)).toEqual([
      "akku-grundlagen",
      "vorflugkontrolle-elios-3",
      "messprotokoll-lesen",
    ]);
  });

  it("liest den Ausschnitt mit Anfang und Ende", () => {
    const collection = parseCollectionMarkdown(PFAD, "alles-zum-akku");
    expect(collection.entries[0].target).toEqual({
      kind: "zeit",
      start: 15,
      end: 50,
    });
  });

  it("entdoppelt NICHT", () => {
    /*
     * Anders als beim Thema: ein Weg darf dieselbe Stelle zweimal zeigen,
     * etwa als Vorgriff und später im Zusammenhang.
     */
    const collection = parseCollectionMarkdown(
      "- [[a-b#00:10]] Erst\n- [[a-b#00:10]] Und noch einmal\n",
      "doppelt",
    );
    expect(collection.entries).toHaveLength(2);
  });

  it("erkennt eine gespeicherte Suche", () => {
    const collection = parseCollectionMarkdown(
      "---\ntitel: Überall Spannung\nsuche: zellspannung\n---\n",
      "ueberall-spannung",
    );
    expect(collection.query).toBe("zellspannung");
    expect(collection.entries).toEqual([]);
    // Eine gespeicherte Suche ohne Liste ist vollständig, kein Mangel.
    expect(collection.problems).toEqual([]);
  });

  it("bemängelt eine Sammlung ohne Liste und ohne Suche", () => {
    const collection = parseCollectionMarkdown(
      "---\ntitel: Leer\n---\nNur Text.",
      "leer",
    );
    expect(collection.problems.map((problem) => problem.kind)).toContain(
      "bezug",
    );
  });

  it("nimmt den ganzen Beitrag, wenn kein Fragment dasteht", () => {
    const collection = parseCollectionMarkdown("- [[akku-grundlagen]]", "x");
    expect(collection.entries[0].target).toEqual({ kind: "ganz" });
  });

  it("nimmt den Slug als Titel, wenn der Kopf keinen nennt", () => {
    const collection = parseCollectionMarkdown("- [[a-b]]", "mein-weg");
    expect(collection.title).toBe("Mein Weg");
  });

  it("nennt für einen Eintrag die Dateizeile", () => {
    // Nicht die Zeile im Text nach dem Kopf — die springt kein Editor an.
    const collection = parseCollectionMarkdown(PFAD, "alles-zum-akku");
    expect(collection.entries[0].sourceLine).toBe(
      fileLineOf(PFAD, "[[akku-grundlagen#00:15-00:50]]"),
    );
    expect(collection.entries[0].sourceLine).toBe(8);
  });

  it("verträgt CRLF", () => {
    const collection = parseCollectionMarkdown(
      "---\r\ntitel: Mit CRLF\r\n---\r\n- [[a-b#01:00]] Da\r\n",
      "crlf",
    );
    expect(collection.entries).toHaveLength(1);
    expect(collection.entries[0].target).toEqual({
      kind: "zeit",
      start: 60,
      end: null,
    });
  });
});

describe("Anlegen und Wiederlesen", () => {
  it("liest eine erzeugte gespeicherte Suche als solche", () => {
    const datei = renderCollectionMarkdown({
      title: "Überall Spannung",
      query: "zellspannung",
    });
    const gelesen = parseCollectionMarkdown(datei, "ueberall-spannung");
    expect(gelesen.title).toBe("Überall Spannung");
    expect(gelesen.query).toBe("zellspannung");
    expect(gelesen.problems).toEqual([]);
  });

  it("zählt eine auskommentierte Beispielzeile NICHT als Ausschnitt", () => {
    /*
     * Beim Anlegen einer Ausschnittsfolge schreibt die Mediathek ein
     * Beispiel als HTML-Kommentar in die Datei. Würde der Parser es lesen,
     * hätte jede neue Sammlung sofort einen Eintrag auf einen Beitrag, den
     * niemand gemeint hat.
     */
    const datei = renderCollectionMarkdown({
      title: "Neue Folge",
      description:
        "Wofür sie gut ist.\n\n<!-- Beispiel:\n" +
        "     - [[erfundener-beitrag#00:10]] zaehlt nicht -->",
      allowEmpty: true,
    });
    const gelesen = parseCollectionMarkdown(datei, "neue-folge");
    expect(gelesen.entries).toEqual([]);
  });

  it("meldet eine frisch angelegte Folge als leer", () => {
    // Das ist die Erinnerung, dass die Ausschnitte noch fehlen — kein Fehler.
    const datei = renderCollectionMarkdown({
      title: "Neue Folge",
      allowEmpty: true,
    });
    const gelesen = parseCollectionMarkdown(datei, "neue-folge");
    expect(gelesen.problems.map((problem) => problem.kind)).toContain("bezug");
  });

  it("schreibt Ausschnitte so, wie der Parser sie wieder einliest", () => {
    const datei = renderCollectionMarkdown({
      title: "Alles zum Akku",
      entries: [
        {
          slug: "akku-grundlagen",
          target: { kind: "zeit", start: 15, end: 50 },
          note: "Messen mit dem Zellprüfer",
        },
        {
          slug: "messprotokoll-lesen",
          target: { kind: "abschnitt", anchor: "akku-und-spannung" },
          note: "",
        },
      ],
    });
    const gelesen = parseCollectionMarkdown(datei, "alles-zum-akku");
    expect(gelesen.entries).toHaveLength(2);
    expect(gelesen.entries[0].target).toEqual({
      kind: "zeit",
      start: 15,
      end: 50,
    });
    expect(gelesen.entries[0].note).toBe("Messen mit dem Zellprüfer");
    expect(gelesen.entries[1].target).toEqual({
      kind: "abschnitt",
      anchor: "akku-und-spannung",
    });
    expect(gelesen.problems).toEqual([]);
  });
});
