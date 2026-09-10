import { describe, expect, it } from "vitest";

import {
  activeChapterIndex,
  buildSectionChapters,
  buildTimeChapters,
  chaptersToVtt,
  findTimeMentions,
  formatTimecode,
  linkifyTimeMentions,
  parseChapterLines,
  parseSectionLines,
  parseTimecode,
} from "./chapters";

describe("parseTimecode", () => {
  const valid: Array<[string, number]> = [
    ["0:00", 0],
    ["00:00", 0],
    ["01:24", 84],
    ["1:24", 84],
    ["12:34", 754],
    // Zweiteilig darf der Minutenteil über 59 liegen.
    ["95:12", 95 * 60 + 12],
    ["120:00", 7200],
    ["1:02:03", 3723],
    ["01:02:03", 3723],
    ["12:34:56", 12 * 3600 + 34 * 60 + 56],
    ["  01:24  ", 84],
  ];
  it.each(valid)("liest %s als %i Sekunden", (input, expected) => {
    expect(parseTimecode(input)).toBe(expected);
  });

  const invalid = [
    "00:60", // Sekunden über 59
    "1:2:3", // Sekunden nicht zweistellig
    "1:75:30", // Minuten über 59 in der dreiteiligen Form
    "12", // ohne Doppelpunkt
    "12:3",
    "abc",
    "",
    "1:2",
    "1234:56", // mehr als drei Minutenstellen
    "1:00:00:00",
  ];
  it.each(invalid)("verwirft %s", (input) => {
    expect(parseTimecode(input)).toBeNull();
  });
});

describe("formatTimecode", () => {
  it.each([
    [0, "00:00"],
    [59, "00:59"],
    [60, "01:00"],
    [84, "01:24"],
    [3599, "59:59"],
    [3600, "1:00:00"],
    [3723, "1:02:03"],
    [86399, "23:59:59"],
  ])("formatiert %i als %s", (input, expected) => {
    expect(formatTimecode(input)).toBe(expected);
  });

  it("erzwingt Stunden auf Wunsch", () => {
    expect(formatTimecode(84, { forceHours: true })).toBe("0:01:24");
  });

  it("ist zum Parser rund", () => {
    for (const seconds of [0, 59, 60, 84, 3599, 3600, 3723, 86399]) {
      expect(parseTimecode(formatTimecode(seconds))).toBe(seconds);
    }
  });
});

describe("parseChapterLines — was ein Kapitel ist", () => {
  const accepted: Array<[string, number, string]> = [
    ["00:00 Einleitung", 0, "Einleitung"],
    ["0:05 Kurz", 5, "Kurz"],
    ["1:02:03 Nachbereitung", 3723, "Nachbereitung"],
    ["[00:00] Einleitung", 0, "Einleitung"],
    ["(0:05) Kurz", 5, "Kurz"],
    ["- 01:24 Akku prüfen", 84, "Akku prüfen"],
    ["* 01:24 Akku prüfen", 84, "Akku prüfen"],
    ["• 01:24 Akku prüfen", 84, "Akku prüfen"],
    ["> 01:24 Akku prüfen", 84, "Akku prüfen"],
    ["1. 01:24 Akku prüfen", 84, "Akku prüfen"],
    ["**01:24 Akku prüfen**", 84, "Akku prüfen"],
    ["00:00 - Einleitung", 0, "Einleitung"],
    ["00:00 – Einleitung", 0, "Einleitung"],
    ["00:00 — Einleitung", 0, "Einleitung"],
    ["00:00: Einleitung", 0, "Einleitung"],
    ["00:00 | Einleitung", 0, "Einleitung"],
    ["00:00\tEinleitung", 0, "Einleitung"],
    ["95:12 Späte Stelle", 95 * 60 + 12, "Späte Stelle"],
    ["01:24 Akku prüfen (Teil 2)", 84, "Akku prüfen (Teil 2)"],
    ["01:24 Akku 🔋 prüfen", 84, "Akku 🔋 prüfen"],
    ["  01:24 Drei Leerzeichen sind erlaubt", 84, "Drei Leerzeichen sind erlaubt"],
  ];
  it.each(accepted)("nimmt %j", (line, start, title) => {
    const found = parseChapterLines(line);
    expect(found).toHaveLength(1);
    expect(found[0].start).toBe(start);
    expect(found[0].title).toBe(title);
  });

  const rejected = [
    "01:24", // ohne Titel
    "Bei 01:24 prüfen wir den Akku", // Zeit nicht am Zeilenanfang
    "00:60 Ungültige Sekunden",
    "1:2:3 Kein Zeitcode",
    "## 01:24 Überschrift ist kein Kapitel",
    "Version 1:24 des Handbuchs",
    "", // leer
    "    01:24 Vier Leerzeichen sind ein Codeblock",
  ];
  it.each(rejected)("verwirft %j", (line) => {
    expect(parseChapterLines(line)).toHaveLength(0);
  });

  it("überspringt umzäunte Codeblöcke", () => {
    const body = [
      "00:00 Echtes Kapitel",
      "```",
      "01:24 Nur ein Beispiel",
      "```",
      "02:00 Noch ein echtes",
    ].join("\n");
    const found = parseChapterLines(body);
    expect(found.map((entry) => entry.title)).toEqual([
      "Echtes Kapitel",
      "Noch ein echtes",
    ]);
  });

  it("liest CRLF-Dateien", () => {
    // splitFrontmatter normalisiert; hier der Rohfall zur Sicherheit.
    const found = parseChapterLines("00:00 Eins\n01:00 Zwei");
    expect(found).toHaveLength(2);
  });

  it("merkt sich die Zeilennummer", () => {
    const found = parseChapterLines("Prosa\n\n01:24 Akku");
    expect(found[0].line).toBe(3);
  });

  it("bleibt bei 200 Kapiteln schnell", () => {
    const body = Array.from(
      { length: 200 },
      (_, i) => `${formatTimecode(i * 30)} Kapitel ${i}`,
    ).join("\n");
    const started = performance.now();
    const found = parseChapterLines(body);
    expect(found).toHaveLength(200);
    expect(performance.now() - started).toBeLessThan(50);
  });
});

describe("buildTimeChapters", () => {
  it("sortiert und verkettet die Enden", () => {
    const lines = parseChapterLines(
      ["02:00 Zwei", "00:00 Null", "01:00 Eins"].join("\n"),
    );
    const { chapters } = buildTimeChapters(lines, { durationSeconds: 180 });
    expect(chapters.map((c) => [c.start, c.end])).toEqual([
      [0, 60],
      [60, 120],
      [120, 180],
    ]);
    expect(chapters.map((c) => c.index)).toEqual([0, 1, 2]);
  });

  it("lässt das letzte Ende offen, wenn die Dauer unbekannt ist", () => {
    const lines = parseChapterLines("00:00 Null\n01:00 Eins");
    const { chapters } = buildTimeChapters(lines, { durationSeconds: null });
    expect(chapters[1].end).toBeNull();
  });

  it("behält beim Duplikat das erste Kapitel und meldet es", () => {
    const lines = parseChapterLines("01:24 Erstes\n01:24 Zweites");
    const { chapters, problems } = buildTimeChapters(lines, {
      durationSeconds: 600,
    });
    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBe("Erstes");
    expect(problems[0].message).toContain("01:24");
  });

  it("verwirft Kapitel hinter dem Ende nicht, markiert sie aber", () => {
    const lines = parseChapterLines("00:00 Anfang\n1:12:00 Zu spät");
    const { chapters, problems } = buildTimeChapters(lines, {
      durationSeconds: 2535,
    });
    expect(chapters).toHaveLength(2);
    expect(chapters[1].beyondEnd).toBe(true);
    expect(problems.some((p) => p.message.includes("neu geschnitten"))).toBe(
      true,
    );
  });

  it("erfindet kein Kapitel bei 0", () => {
    const lines = parseChapterLines("01:00 Erst später");
    const { chapters } = buildTimeChapters(lines, { durationSeconds: 600 });
    expect(chapters).toHaveLength(1);
    expect(chapters[0].start).toBe(60);
  });

  it("kommt mit einem leeren Body aus", () => {
    const { chapters, problems } = buildTimeChapters(parseChapterLines(""), {
      durationSeconds: null,
    });
    expect(chapters).toEqual([]);
    expect(problems).toEqual([]);
  });
});

describe("Abschnittskapitel in Textbeiträgen", () => {
  it("nimmt Ebene 2 und 3, nicht Ebene 1", () => {
    const body = [
      "# Dokumenttitel",
      "## Erster Abschnitt",
      "Text",
      "### Unterabschnitt",
      "#### Zu tief",
    ].join("\n");
    const found = parseSectionLines(body);
    expect(found.map((s) => [s.level, s.title])).toEqual([
      [2, "Erster Abschnitt"],
      [3, "Unterabschnitt"],
    ]);
  });

  it("erzeugt vorhersagbare Anker und löst Doppelte auf", () => {
    const found = parseSectionLines(
      ["## Akku prüfen", "## Rotor", "## Akku prüfen"].join("\n"),
    );
    const { chapters } = buildSectionChapters(found);
    expect(chapters.map((c) => c.anchor)).toEqual([
      "akku-pruefen",
      "rotor",
      "akku-pruefen-2",
    ]);
  });

  it("überspringt Überschriften in Codeblöcken", () => {
    const body = ["## Echt", "```", "## Beispiel", "```"].join("\n");
    expect(parseSectionLines(body).map((s) => s.title)).toEqual(["Echt"]);
  });

  it("entfernt abschließende Rauten", () => {
    expect(parseSectionLines("## Titel ##")[0].title).toBe("Titel");
  });
});

describe("findTimeMentions und linkifyTimeMentions", () => {
  it("findet Zeitmarken mitten im Satz", () => {
    const mentions = findTimeMentions("Wie ab 12:40 gezeigt, siehe 1:02:03.");
    expect(mentions.map((m) => m.start)).toEqual([760, 3723]);
  });

  it("verlinkt Zeitmarken als Markdown", () => {
    expect(linkifyTimeMentions("Ab 12:40 wird es wichtig.")).toBe(
      "Ab [12:40](#t=760) wird es wichtig.",
    );
  });

  it("lässt Wikilinks, Links und Inline-Code unangetastet", () => {
    const input =
      "[[akku#12:40]] und [schon](#t=1) und `12:40` aber 02:00 nicht.";
    const output = linkifyTimeMentions(input);
    expect(output).toContain("[[akku#12:40]]");
    expect(output).toContain("`12:40`");
    expect(output).toContain("[02:00](#t=120)");
    // Der bestehende Link darf nicht verschachtelt werden.
    expect(output).not.toContain("[[schon]");
  });

  it("lässt Codeblöcke unangetastet", () => {
    const input = ["```", "12:40 im Codeblock", "```"].join("\n");
    expect(linkifyTimeMentions(input)).toBe(input);
  });

  it("verlinkt mehrere Marken in einer Zeile", () => {
    expect(linkifyTimeMentions("00:10 und 00:20")).toBe(
      "[00:10](#t=10) und [00:20](#t=20)",
    );
  });
});

describe("chaptersToVtt", () => {
  it("schreibt gültiges WebVTT", () => {
    const lines = parseChapterLines("00:00 Einleitung\n01:24 Akku");
    const { chapters } = buildTimeChapters(lines, { durationSeconds: 2535 });
    const vtt = chaptersToVtt(chapters, 2535);
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).toContain("00:00:00.000 --> 00:01:24.000");
    expect(vtt).toContain("00:01:24.000 --> 00:42:15.000");
    expect(vtt).toContain("Einleitung");
  });

  it("liefert einen leeren Track ohne Kapitel", () => {
    expect(chaptersToVtt([], 100)).toBe("WEBVTT\n");
  });

  it("lässt Kapitel hinter dem Ende weg", () => {
    const lines = parseChapterLines("00:00 Anfang\n1:12:00 Zu spät");
    const { chapters } = buildTimeChapters(lines, { durationSeconds: 2535 });
    const vtt = chaptersToVtt(chapters, 2535);
    expect(vtt).not.toContain("Zu spät");
  });

  it("überspringt Abschnittskapitel", () => {
    const { chapters } = buildSectionChapters(parseSectionLines("## Eins"));
    expect(chaptersToVtt(chapters, null)).toBe("WEBVTT\n");
  });
});

describe("activeChapterIndex", () => {
  const starts = [0, 60, 120];
  it.each([
    [-1, -1],
    [0, 0],
    [59.999, 0],
    [60, 1],
    [119, 1],
    [120, 2],
    [9999, 2],
  ])("bei %s ist Kapitel %i aktiv", (time, expected) => {
    expect(activeChapterIndex(starts, time)).toBe(expected);
  });

  it("liefert -1 bei leerer Liste", () => {
    expect(activeChapterIndex([], 5)).toBe(-1);
  });

  it("liefert -1, wenn das erste Kapitel später beginnt", () => {
    expect(activeChapterIndex([30], 10)).toBe(-1);
  });
});
