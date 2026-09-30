import { describe, expect, it } from "vitest";

import {
  applyStatus,
  artOf,
  assertInvocation,
  buildCliArgs,
  buildOrder,
  focusFrom,
  formatTranscript,
  glossaryTerms,
  hearingRules,
  mediaBeside,
  nextStatus,
  noteRelatives,
  parseVaultArgs,
  readToolset,
  replaceHearings,
  replaceHearingsInNote,
  sendsPromptOnStdin,
  splitArgs,
  structuralHinweis,
  TASKS,
  upsertTranscript,
} from "./vault-lib.mjs";

const folders = readToolset(`
version: 1
inbox: 00_Inbox
ordner:
  notizen: 10_Notizen
  anhaenge: 20_Attachments
  karten: 30_Themen
  glossar: 40_Glossar
  fragen: 50_Fragen
`);

describe("Auftrag", () => {
  const texts = {
    kapitel: "Einzelne Notiz.",
    "kapitel-alle": "Alle leeren Kapitel.",
    sichtung: "Nur urteilen.",
    inbox: "Einsortieren.",
    bestand: "Antwort ablegen.",
    vollstaendigkeit: "Lücken.",
  };

  it("setzt Regeln, Anleitung und Notiz in den Auftrag", () => {
    const prompt = buildOrder({
      task: "kapitel",
      note: "Vorflugkontrolle Elios 3",
      question: null,
      regeln: "# Regeln\n\nNur unter den Überschriften.",
      texts,
    });
    expect(prompt.match(/^# Regeln$/gm)).toHaveLength(1);
    expect(prompt).toContain("Nur unter den Überschriften.");
    expect(prompt).toContain("# %_kapitel.md");
    expect(prompt).toContain("Es geht um die Notiz Vorflugkontrolle Elios 3.");
    expect(prompt).toContain("stehen vollständig in diesem Text");
  });

  it("hängt die Kapitel-Anleitung hinter den Sammelauftrag", () => {
    const prompt = buildOrder({
      task: "kapitel-alle",
      note: null,
      question: null,
      regeln: "Regeln",
      texts,
    });
    expect(prompt.indexOf("# %_kapitel-alle.md")).toBeLessThan(prompt.indexOf("# %_kapitel.md"));
    expect(prompt).not.toContain("Es geht um die Notiz");
  });

  it("stellt die Sichtung vor die Inbox", () => {
    const prompt = buildOrder({
      task: "inbox",
      note: null,
      question: null,
      regeln: "Regeln",
      texts,
    });
    expect(prompt.indexOf("# %_sichtung.md")).toBeLessThan(prompt.indexOf("# %_inbox.md"));
  });

  it("hängt die Frage unter die Anleitung", () => {
    const prompt = buildOrder({
      task: "bestand",
      note: null,
      question: "Wie messe ich?",
      regeln: "Regeln",
      texts,
    });
    expect(prompt.trimEnd().endsWith("Frage:\nWie messe ich?")).toBe(true);
  });

  it("liest version 1 und lehnt eine andere ab", () => {
    expect(folders.ordner.notizen).toBe("10_Notizen");
    expect(() => readToolset("version: 2\n")).toThrow(/version 2/);
    expect(() => readToolset("inbox: 00_Inbox\n")).toThrow(/keine version/);
  });
});

describe("Aufruf", () => {
  it("liest Optionen und die Frage als Rest", () => {
    const parsed = parseVaultArgs(["--vault", "D:\\Wissen", "--was", "bestand", "Wie", "messe", "ich?"]);
    expect(parsed).toMatchObject({
      vault: "D:\\Wissen",
      dryRun: true,
      task: "bestand",
      werkzeug: "grok",
      rest: ["Wie", "messe", "ich?"],
    });
    expect(focusFrom("bestand", parsed.rest)).toEqual({ note: null, question: "Wie messe ich?" });
  });

  it("verlangt genau einen Notiznamen", () => {
    expect(focusFrom("kapitel", ["Vorflugkontrolle Elios 3.md"])).toEqual({
      note: "Vorflugkontrolle Elios 3",
      question: null,
    });
    expect(() => focusFrom("kapitel", [])).toThrow(/Genau ein Name/);
    expect(() => focusFrom("glossar", ["extra"])).toThrow(/keinen Namen/);
    expect(() => assertInvocation({ vault: "", werkzeug: "grok", bin: "", timeoutSec: 900, task: "glossar" })).toThrow(
      /vault/,
    );
  });

  it("sucht die Notiz im Notizordner", () => {
    expect(noteRelatives(folders, "kapitel", "Elios 3")).toEqual(["10_Notizen/Elios 3.md"]);
    expect(noteRelatives(folders, "sichtung", "roh.mp4")).toEqual(["00_Inbox/roh.mp4"]);
    expect(() => noteRelatives(folders, "kapitel", "../geheim")).toThrow(/Verzeichnis/);
  });

  it("kennt wortlaut und schreibt nur mit --anwenden", () => {
    expect(TASKS).toContain("wortlaut");
    const parsed = parseVaultArgs(["--vault", "D:\\Wissen", "--anwenden", "wortlaut"]);
    expect(parsed).toMatchObject({ task: "wortlaut", anwenden: true, dryRun: false });
    const shown = parseVaultArgs(["--vault", "D:\\Wissen", "--was", "--anwenden", "wortlaut"]);
    expect(shown.anwenden && !shown.dryRun).toBe(false);
    expect(() =>
      assertInvocation({ vault: "D:\\Wissen", werkzeug: "grok", bin: "", timeoutSec: 900, task: "wortlaut" }),
    ).not.toThrow();
  });
});

describe("CLI-Argumente", () => {
  it("gibt Grok den Auftrag als Datei und ohne Netz", () => {
    expect(buildCliArgs({ cliPreset: "grok", cliBinary: "", cliExtraArgs: "" }, "C:\\temp\\auftrag.txt")).toEqual([
      "--prompt-file",
      "C:\\temp\\auftrag.txt",
      "--permission-mode",
      "acceptEdits",
      "--disable-web-search",
    ]);
    expect(sendsPromptOnStdin("grok")).toBe(false);
  });

  it("gibt Claude den Auftrag über stdin", () => {
    expect(buildCliArgs({ cliPreset: "claude", cliBinary: "", cliExtraArgs: "--model x" }, "x")).toEqual([
      "-p",
      "--permission-mode",
      "acceptEdits",
      "--model",
      "x",
    ]);
    expect(sendsPromptOnStdin("claude")).toBe(true);
  });

  it("teilt Argumente an Anführungszeichen", () => {
    expect(splitArgs('--model "ein name"')).toEqual(["--model", "ein name"]);
  });
});

describe("Transkription", () => {
  it("findet die Mediendatei neben der Notiz", () => {
    expect(mediaBeside("Elios 3 Daten", ["Elios 3 Daten.md", "Elios 3 Daten.mp4"])).toBe("Elios 3 Daten.mp4");
    expect(mediaBeside("Nur Text", ["Nur Text.md"])).toBeNull();
  });

  it("nimmt nur das Feld begriff als Fachwort", () => {
    expect(
      glossaryTerms(["---\nbegriff: NautiQ\naliases: [Nauti Q]\nhoerfehler: [Nautilus]\nsynonyme: [Nauti Q 360]\n---\n"]),
    ).toEqual(["NautiQ"]);
  });

  it("schreibt das Transkript unter die Überschrift", () => {
    const body = formatTranscript([{ start: 30, text: " Zellspannung " }]);
    expect(body).toBe("00:30 Zellspannung");
    const next = upsertTranscript("# Titel\n\nText\n", body);
    expect(next).toContain("## Transkript\n\n00:30 Zellspannung");
    expect(upsertTranscript(`${next}\n## Bezüge\n\n- bleibt\n`, "neu")).toContain("## Bezüge");
  });
});

describe("Hörfehler", () => {
  const quelle = "---\nbegriff: NautiQ\nsynonyme: [Eigenbau-Drohne]\nhoerfehler: [Nautilus, Nautik, Nautiq]\n---\n";

  it("liest nur hoerfehler und lässt die richtige Form stehen", () => {
    const rules = hearingRules([quelle]);
    expect(rules.map((rule) => rule.wrong)).toEqual(["Nautilus", "Nautik", "Nautiq"]);
    const text = "die NautiQ, der Nautik, ein Nautilus, der Nautiker und Nautiq 360";
    const result = replaceHearings(text, rules);
    expect(result.text).toBe("die NautiQ, der NautiQ, ein NautiQ, der Nautiker und NautiQ 360");
    expect(result.hits.map((hit) => hit.wrong)).toEqual(["Nautik", "Nautilus", "Nautiq"]);
    const adjacent = replaceHearings("der Nautik und Nautiq", rules);
    expect(adjacent.text).toBe("der NautiQ und NautiQ");
    expect(adjacent.hits[0].snippet).toBe("der Nautik und Nautiq");
  });

  it("bevorzugt die längere Form", () => {
    const rules = hearingRules(["---\nbegriff: CloudCompare\nhoerfehler: [Cloud Compare, Cloud]\n---\n"]);
    expect(replaceHearings("Cloud Compare und Cloud", rules).text).toBe("CloudCompare und CloudCompare");
  });

  it("lässt das Frontmatter stehen und maskiert Anführungszeichen im Transkript", () => {
    const note = "---\nbegriff: NautiQ\nhoerfehler: [Nautilus]\n---\n\nIm Text Nautilus.\n";
    const replaced = replaceHearingsInNote(note, hearingRules([note]));
    expect(replaced.text).toBe("---\nbegriff: NautiQ\nhoerfehler: [Nautilus]\n---\n\nIm Text NautiQ.\n");
    const raw = '{\n "text": "der Nautik und"\n}\n';
    expect(replaceHearings(raw, hearingRules([quelle]), { json: true }).text).toBe(
      '{\n "text": "der NautiQ und"\n}\n',
    );
    expect(replaceHearings("x Foo y", [{ wrong: "Foo", begriff: 'A"B' }], { json: true }).text).toBe('x A\\"B y');
  });
});

describe("Hinweis", () => {
  it("nennt die fehlende Nacharbeit", () => {
    expect(
      structuralHinweis({
        art: "Video",
        hasTranscript: false,
        hasChapters: false,
        hasSpots: false,
      }),
    ).toBe("Transkript und Kapitel fehlen");
    expect(
      structuralHinweis({
        art: "Karte",
        hasTranscript: false,
        hasChapters: false,
        hasSpots: true,
      }),
    ).toBe("");
  });

  it("setzt status und hinweis, ohne den Text anzufassen", () => {
    const next = applyStatus("---\ntyp: Medium\nstatus: erschlossen\n---\n\nAbsatz\n", "offen", "Kapitel fehlen");
    expect(next).toContain("status: offen");
    expect(next).toContain("hinweis: Kapitel fehlen");
    expect(next).toContain("Absatz");
    expect(applyStatus(next, "erschlossen", "")).not.toContain("hinweis:");
  });

  it("lässt einen vorhandenen Hinweis stehen, wenn die Struktur vollständig ist", () => {
    const text = "---\nstatus: offen\nhinweis: Ton fehlt\n---\n\n## Kapitel\n\n### 00:00 Start\n";
    expect(
      nextStatus(text, { art: "Video", hasTranscript: true, hasChapters: true, hasSpots: false }),
    ).toBeNull();
    expect(artOf("---\nart: Audio\n---\n")).toBe("Audio");
  });
});
