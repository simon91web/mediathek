import { describe, expect, it } from "vitest";

import { analyzeLivePreviewLines, wikilinkLabel } from "./live-preview";

/*
 * Der Live-Vorschau-Editor darf keine zweite Vorstellung von "Kapitelzeile"
 * oder "Marker" haben als der Rest der Mediathek — diese Tests halten fest,
 * dass die Analyse mit den echten Parsern übereinstimmt.
 */

const VIDEO_ITEM = [
  "---",
  "titel: Test",
  "---",
  "",
  "## Vorflugkontrolle",
  "",
  "Vor jedem Start wird die **Zellspannung** geprüft.",
  "",
  "<!-- kapitel:start -->",
  "01:24 Akku prüfen",
  "05:10 Sensorkalibrierung",
  "<!-- kapitel:ende -->",
  "",
  "<!-- bezuege:start -->",
  "<!-- bezuege:ende -->",
  "",
].join("\n");

describe("analyzeLivePreviewLines", () => {
  it("markiert den Kopf als Frontmatter", () => {
    const analysis = analyzeLivePreviewLines(VIDEO_ITEM, "video", null);
    expect(analysis.get(1)).toEqual({ type: "frontmatter" });
    expect(analysis.get(2)).toEqual({ type: "frontmatter" });
    expect(analysis.get(3)).toEqual({ type: "frontmatter" });
  });

  it("erkennt eine Überschrift mit ihrer Ebene", () => {
    const analysis = analyzeLivePreviewLines(VIDEO_ITEM, "video", null);
    expect(analysis.get(5)).toEqual({ type: "heading", level: 2 });
  });

  it("lässt Fließtext unentschieden — das übernimmt der Editor selbst", () => {
    const analysis = analyzeLivePreviewLines(VIDEO_ITEM, "video", null);
    expect(analysis.has(7)).toBe(false);
  });

  it("erkennt Start- und Ende-Marker mit dem Namen des Blocks", () => {
    const analysis = analyzeLivePreviewLines(VIDEO_ITEM, "video", null);
    expect(analysis.get(9)).toEqual({ type: "marker", label: "Kapitel beginnt" });
    expect(analysis.get(12)).toEqual({ type: "marker", label: "Kapitel endet" });
    expect(analysis.get(14)).toEqual({ type: "marker", label: "Bezüge beginnt" });
    expect(analysis.get(15)).toEqual({ type: "marker", label: "Bezüge endet" });
  });

  it("erkennt Kapitelzeilen bei Video/Audio mit Zeit und Titel", () => {
    const analysis = analyzeLivePreviewLines(VIDEO_ITEM, "video", null);
    expect(analysis.get(10)).toEqual({
      type: "chapter",
      time: "01:24",
      title: "Akku prüfen",
    });
    expect(analysis.get(11)).toEqual({
      type: "chapter",
      time: "05:10",
      title: "Sensorkalibrierung",
    });
  });

  it("schreibt Kapitelzeiten ab einer Stunde mit Stundenanteil", () => {
    const analysis = analyzeLivePreviewLines(VIDEO_ITEM, "video", 4000);
    expect(analysis.get(10)).toMatchObject({ time: "0:01:24" });
  });

  it("kennt bei Textbeiträgen keine Kapitelzeilen — dort zählen Überschriften", () => {
    const withTimeLine = VIDEO_ITEM.replace(
      "Vor jedem Start wird die **Zellspannung** geprüft.",
      "01:24 sieht hier aus wie ein Kapitel, ist bei Text aber Fließtext.",
    );
    const analysis = analyzeLivePreviewLines(withTimeLine, "text", null);
    expect(analysis.has(7)).toBe(false);
  });

  it("erkennt einen unvollständigen Marker trotzdem als Marker", () => {
    const withoutClose = VIDEO_ITEM.replace(
      "<!-- kapitel:ende -->\n\n",
      "",
    );
    const analysis = analyzeLivePreviewLines(withoutClose, "video", null);
    expect(analysis.get(9)).toEqual({ type: "marker", label: "Kapitel beginnt" });
  });

  it("markiert Codezeilen, damit sie nicht als Überschrift o.ä. missverstanden werden", () => {
    const withCode = VIDEO_ITEM.replace(
      "Vor jedem Start wird die **Zellspannung** geprüft.",
      "```\n## Kein Kapitel, nur ein Beispiel\n```",
    );
    const analysis = analyzeLivePreviewLines(withCode, "video", null);
    expect(analysis.get(7)).toEqual({ type: "code" });
    expect(analysis.get(8)).toEqual({ type: "code" });
    expect(analysis.get(9)).toEqual({ type: "code" });
  });

  it("kommt ohne Frontmatter aus", () => {
    const analysis = analyzeLivePreviewLines("# Nur Text\n\nEin Satz.", "text", null);
    expect(analysis.get(1)).toEqual({ type: "heading", level: 1 });
    expect(analysis.has(3)).toBe(false);
  });
});

describe("wikilinkLabel", () => {
  it("zeigt den ganzen Beitrag nur als Kennung", () => {
    expect(wikilinkLabel("akku-pruefen", { kind: "ganz" })).toBe("akku-pruefen");
  });

  it("zeigt einen Abschnitt mit seinem Anker", () => {
    expect(
      wikilinkLabel("messprotokoll", { kind: "abschnitt", anchor: "fehlerbilder" }),
    ).toBe("messprotokoll · fehlerbilder");
  });

  it("zeigt eine Zeitmarke", () => {
    expect(
      wikilinkLabel("akku-pruefen", { kind: "zeit", start: 760, end: null }),
    ).toBe("akku-pruefen · 12:40");
  });

  it("zeigt einen Ausschnitt als Zeitspanne", () => {
    expect(
      wikilinkLabel("akku-pruefen", { kind: "zeit", start: 760, end: 1085 }),
    ).toBe("akku-pruefen · 12:40–18:05");
  });
});
