import { describe, expect, it } from "vitest";

import {
  aggregateStufe,
  buildCompleteness,
  computeDeterministicFindings,
  deriveStufeFachfremd,
  deriveStufeFachkundig,
  parseCompletenessReport,
  summarizeCompleteness,
} from "./completeness";
import type { Item, Spot, Topic } from "./types";

function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    slug: "thema-1",
    title: "Thema 1",
    description: "Eine kurze Beschreibung.",
    itemSlugs: [],
    missingSlugs: [],
    synonyms: [],
    spots: [],
    tags: [],
    changedAtMs: 0,
    problems: [],
    ...overrides,
  };
}

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    slug: "beitrag-1",
    kind: "video",
    title: "Beitrag 1",
    tags: [],
    recorded: null,
    durationSeconds: null,
    description: "",
    chapters: [],
    summary: null,
    references: [],
    attachments: [],
    hasTranscript: false,
    transcriptSegmentCount: null,
    assets: {
      dir: "",
      markdownFile: "",
      mediaFile: null,
      mediaName: null,
      mediaBytes: null,
      mediaMime: null,
      posterFile: null,
      transcriptJsonFile: null,
      transcriptVttFile: null,
      attachmentsDir: null,
    },
    problems: [],
    fingerprint: {
      markdown: null,
      media: null,
      poster: null,
      transcript: null,
      attachments: null,
    },
    addedAtMs: 0,
    changedAtMs: 0,
    ...overrides,
  };
}

function spot(overrides: Partial<Spot> = {}): Spot {
  return { slug: "beitrag-1", target: { kind: "ganz" }, note: "", sourceLine: 1, ...overrides };
}

describe("computeDeterministicFindings", () => {
  it("meldet eine fehlende Beschreibung", () => {
    const topics = [makeTopic({ description: "   " })];
    const result = computeDeterministicFindings(topics, new Map());
    expect(result.get("thema-1")!.map((b) => b.kategorie)).toContain(
      "keine-beschreibung",
    );
  });

  it("meldet ein Synonym, das nirgends vorkommt", () => {
    const topics = [
      makeTopic({
        synonyms: ["Zellprüfer"],
        description: "Balancing erklärt.",
        itemSlugs: ["beitrag-1"],
      }),
    ];
    const result = computeDeterministicFindings(topics, new Map());
    expect(result.get("thema-1")).toEqual([
      {
        kategorie: "synonym-ohne-fundstelle",
        text:
          'Das Synonym „Zellprüfer" kommt in keiner Fundstelle, Beschreibung ' +
          "oder einem verlinkten Beitrag vor.",
        belege: [],
      },
    ]);
  });

  it("findet ein Synonym unabhängig von Groß-/Kleinschreibung und Umlauten", () => {
    const topics = [
      makeTopic({
        synonyms: ["Zellpruefer"],
        description: "Hier steht etwas über den ZELLPRÜFER.",
        itemSlugs: ["beitrag-1"],
      }),
    ];
    const result = computeDeterministicFindings(topics, new Map());
    expect(result.get("thema-1")).toEqual([]);
  });

  it("findet ein Synonym in der Fundstellen-Notiz eines verlinkten Beitrags", () => {
    const topics = [
      makeTopic({
        synonyms: ["Balancing"],
        itemSlugs: ["beitrag-1"],
        spots: [spot({ note: "Hier geht es um das Balancing." })],
      }),
    ];
    const items = new Map([["beitrag-1", makeItem()]] as const);
    const result = computeDeterministicFindings(topics, items);
    expect(result.get("thema-1")).toEqual([]);
  });

  it("findet ein Synonym in einem Kapiteltitel des verlinkten Beitrags", () => {
    const topics = [
      makeTopic({ synonyms: ["Balancing"], itemSlugs: ["beitrag-1"] }),
    ];
    const items = new Map([
      [
        "beitrag-1",
        makeItem({
          chapters: [
            {
              kind: "zeit",
              index: 0,
              title: "Balancing einstellen",
              sourceLine: 1,
              summary: null,
              start: 0,
              end: null,
              beyondEnd: false,
            },
          ],
        }),
      ],
    ] as const);
    const result = computeDeterministicFindings(topics, items);
    expect(result.get("thema-1")).toEqual([]);
  });

  it("meldet ein Thema ohne jeden Beitrag und ohne Fundstelle", () => {
    const topics = [makeTopic({ itemSlugs: [], spots: [] })];
    const result = computeDeterministicFindings(topics, new Map());
    expect(result.get("thema-1")!.map((b) => b.kategorie)).toContain(
      "wenige-fundstellen",
    );
  });

  it("meldet auffällig wenig Umfang gegenüber dem Median anderer Themen", () => {
    const topics = [
      makeTopic({ slug: "gross-1", itemSlugs: ["a", "b", "c", "d"] }),
      makeTopic({ slug: "gross-2", itemSlugs: ["a", "b", "c", "d"] }),
      makeTopic({ slug: "gross-3", itemSlugs: ["a", "b", "c", "d"] }),
      makeTopic({ slug: "duenn", itemSlugs: ["a"] }),
    ];
    const result = computeDeterministicFindings(topics, new Map());
    expect(result.get("duenn")!.map((b) => b.kategorie)).toContain(
      "wenige-fundstellen",
    );
    expect(result.get("gross-1")!.map((b) => b.kategorie)).not.toContain(
      "wenige-fundstellen",
    );
  });
});

describe("deriveStufeFachfremd", () => {
  const cases: Array<[number, number, number, ReturnType<typeof deriveStufeFachfremd>]> = [
    // [Befunde, Umfang, Median, erwartete Stufe]
    [0, 6, 4, "vertieft"],
    [0, 4, 4, "breit"],
    [0, 1, 4, "lueckenhaft"],
    [1, 4, 4, "im-aufbau"],
    [2, 4, 4, "lueckenhaft"],
    [0, 2, 4, "im-aufbau"],
    [0, 3, 0, "breit"], // keine anderen Themen zum Vergleichen
  ];
  it.each(cases)(
    "%i Befunde, Umfang %i, Median %i → %s",
    (befunde, umfang, median, expected) => {
      expect(deriveStufeFachfremd(befunde, umfang, median)).toBe(expected);
    },
  );
});

describe("deriveStufeFachkundig", () => {
  const cases: Array<[boolean, boolean, number, ReturnType<typeof deriveStufeFachkundig>]> = [
    [false, false, 0, "ungeprueft"],
    [true, false, 0, "ungeprueft"],
    [true, true, 0, "breit"],
    [true, true, 1, "im-aufbau"],
    [true, true, 2, "im-aufbau"],
    [true, true, 3, "lueckenhaft"],
  ];
  it.each(cases)(
    "Bericht=%s, gesehen=%s, %i Befunde → %s",
    (reportVorhanden, gesehen, befunde, expected) => {
      expect(deriveStufeFachkundig(reportVorhanden, gesehen, befunde)).toBe(
        expected,
      );
    },
  );
});

describe("parseCompletenessReport", () => {
  it("liest ein vollständiges Beispiel", () => {
    const raw = `Zuletzt geprüft: 2026-09-18T14:32:00Z

## [[akku-grundlagen]]

### Unbelegte Zahl
- „3,0 V nicht unterschreiten" ohne Quelle. [[akku-1#03:12]]

### Widerspruch
- Unterschiedliche Ladeschwelle. [[akku-1#01:40]] [[vorflug-2#04:55]]

## [[balancing]]

## Unverortete Fäden

- Kompass-Kalibrierung, in vier Kapiteln erwähnt. [[vorflug-1#02:10]] [[kalibrierung-2#00:45]]
`;
    const result = parseCompletenessReport(raw);

    expect(result.geprueftAm).toBe("2026-09-18T14:32:00Z");
    expect(result.problems).toEqual([]);

    const akku = result.byTopic.get("akku-grundlagen")!;
    expect(akku).toHaveLength(2);
    expect(akku[0]).toMatchObject({
      kategorie: "unbelegte-zahl",
      text: '„3,0 V nicht unterschreiten" ohne Quelle.',
    });
    expect(akku[0].belege).toEqual([
      { slug: "akku-1", target: { kind: "zeit", start: 192, end: null }, note: "", sourceLine: 6 },
    ]);
    expect(akku[1].belege).toHaveLength(2);

    // Ohne Kategorien darunter — trotzdem "gesehen", nicht "ungeprueft".
    expect(result.byTopic.has("balancing")).toBe(true);
    expect(result.byTopic.get("balancing")).toEqual([]);

    expect(result.unverorteteFaeden).toHaveLength(1);
    expect(result.unverorteteFaeden[0].belege).toHaveLength(2);
  });

  it("verwirft einen Befund ohne Beleg und meldet es als Hinweis", () => {
    const raw = `## [[thema]]

### Widerspruch
- Ein Satz ganz ohne Verweis.
`;
    const result = parseCompletenessReport(raw);
    expect(result.byTopic.get("thema")).toEqual([]);
    expect(result.problems).toEqual([
      { kind: "vollstaendigkeit", message: "Ein Befund ohne Beleg wird verworfen.", line: 4 },
    ]);
  });

  it("meldet eine unbekannte Kategorie und verwirft ihre Befunde", () => {
    const raw = `## [[thema]]

### Erfundene Kategorie
- Etwas. [[a#01:00]]
`;
    const result = parseCompletenessReport(raw);
    expect(result.byTopic.get("thema")).toEqual([]);
    expect(result.problems).toEqual([
      { kind: "vollstaendigkeit", message: 'Unbekannte Kategorie „Erfundene Kategorie".', line: 3 },
      {
        kind: "vollstaendigkeit",
        message: "Ein Befund steht außerhalb einer erkannten Kategorie.",
        line: 4,
      },
    ]);
  });

  it("meldet einen unbekannten Abschnitt", () => {
    const raw = `## Irgendwas anderes

- Zeile. [[a#01:00]]
`;
    const result = parseCompletenessReport(raw);
    expect(result.problems).toEqual([
      {
        kind: "vollstaendigkeit",
        message: 'Unbekannter Abschnitt „Irgendwas anderes" wird ignoriert.',
        line: 1,
      },
      {
        kind: "vollstaendigkeit",
        message: "Ein Befund steht außerhalb einer erkannten Kategorie.",
        line: 3,
      },
    ]);
  });
});

describe("aggregateStufe", () => {
  it("ist ungeprueft, wenn alle Themen ungeprueft sind", () => {
    expect(aggregateStufe(["ungeprueft", "ungeprueft"])).toBe("ungeprueft");
  });

  it("ignoriert ungeprueft neben bewerteten Themen", () => {
    expect(aggregateStufe(["ungeprueft", "breit", "breit"])).toBe("breit");
  });

  it("rundet den Durchschnitt der Ränge", () => {
    // (0 + 3) / 2 = 1.5, JS rundet .5 aufwärts → Index 2 = "breit".
    expect(aggregateStufe(["lueckenhaft", "vertieft"])).toBe("breit");
    expect(aggregateStufe(["breit", "vertieft"])).toBe("vertieft");
    expect(aggregateStufe(["breit", "breit", "breit"])).toBe("breit");
  });

  it("lässt ein einzelnes lückenhaftes Thema nicht die ganze Bibliothek kippen", () => {
    expect(
      aggregateStufe(["lueckenhaft", "breit", "breit", "breit", "breit"]),
    ).toBe("breit");
  });
});

describe("buildCompleteness", () => {
  it("bleibt ohne Bericht bei fachkundig=ungeprueft, fachfremd aber schon berechnet", () => {
    const topics = [makeTopic({ description: "" })];
    const { completeness } = buildCompleteness(topics, new Map(), null);
    expect(completeness.geprueftAm).toBeNull();
    const eintrag = completeness.byTopic.get("thema-1")!;
    expect(eintrag.fachkundig.stufe).toBe("ungeprueft");
    expect(eintrag.fachfremd.stufe).toBe("lueckenhaft");
  });

  it("übernimmt Befunde und Zeitpunkt aus einem vorhandenen Bericht", () => {
    const topics = [makeTopic()];
    const raw = `Zuletzt geprüft: 2026-01-01T00:00:00Z

## [[thema-1]]

### Offener Verweis
- Nie beantwortet. [[a#01:00]]
`;
    const { completeness } = buildCompleteness(topics, new Map(), raw);
    expect(completeness.geprueftAm).toBe("2026-01-01T00:00:00Z");
    const eintrag = completeness.byTopic.get("thema-1")!;
    expect(eintrag.fachkundig.stufe).toBe("im-aufbau");
    expect(eintrag.fachkundig.befunde).toHaveLength(1);
  });
});

describe("summarizeCompleteness", () => {
  it("meldet 'Noch nicht geprüft', solange kein Bericht existiert", () => {
    const topics = [makeTopic()];
    const { completeness } = buildCompleteness(topics, new Map(), null);
    const summary = summarizeCompleteness(topics, completeness);
    expect(summary.geprueftAm).toBeNull();
    expect(summary.fachkundigStufe).toBe("ungeprueft");
    expect(summary.fachkundigHinweis).toBe("Noch nicht geprüft.");
  });

  it("meldet 'Keine Befunde', wenn der Bericht nichts findet", () => {
    const topics = [makeTopic()];
    const raw = "Zuletzt geprüft: 2026-01-01T00:00:00Z\n\n## [[thema-1]]\n";
    const { completeness } = buildCompleteness(topics, new Map(), raw);
    const summary = summarizeCompleteness(topics, completeness);
    expect(summary.fachkundigStufe).toBe("breit");
    expect(summary.fachkundigHinweis).toBe("Keine Befunde.");
  });

  it("zählt Befunde über mehrere Themen zusammen, mit korrekter Pluralform", () => {
    const topics = [
      makeTopic({ slug: "a" }),
      makeTopic({ slug: "b" }),
    ];
    const raw = `Zuletzt geprüft: 2026-01-01T00:00:00Z

## [[a]]

### Unbelegte Zahl
- Erste. [[x#01:00]]

## [[b]]

### Unbelegte Zahl
- Zweite. [[x#02:00]]

### Widerspruch
- Dritte. [[x#03:00]] [[y#01:00]]
`;
    const { completeness } = buildCompleteness(topics, new Map(), raw);
    const summary = summarizeCompleteness(topics, completeness);
    expect(summary.fachkundigHinweis).toBe("2 unbelegte Zahlen · 1 Widerspruch");
  });

  it("zählt fachfremdOk nur breite/vertiefte Themen", () => {
    const topics = [
      makeTopic({ slug: "a", description: "" }), // lueckenhaft
      makeTopic({ slug: "b", itemSlugs: ["x", "y"] }), // breit
    ];
    const { completeness } = buildCompleteness(topics, new Map(), null);
    const summary = summarizeCompleteness(topics, completeness);
    expect(summary.fachfremdOk).toBe(1);
    expect(summary.fachfremdGesamt).toBe(2);
  });
});
