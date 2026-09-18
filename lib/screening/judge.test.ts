import { describe, expect, it } from "vitest";

import { parseResponse } from "./judge";

/*
 * Die erste Zeile der Assistenten-Antwort trägt das Urteil, der Rest ist
 * Fließtext. Eine Antwort, die sich nicht ans Format hält, darf nie
 * abstürzen — sie zählt dann als "unklar".
 */
describe("parseResponse", () => {
  it("liest ein bekanntes Präfix", () => {
    expect(parseResponse("EINSCHÄTZUNG: neu\nZeigt etwas Neues.")).toEqual({
      verdict: "neu",
      text: "Zeigt etwas Neues.",
    });
  });

  it("ist unempfindlich gegen Groß-/Kleinschreibung", () => {
    expect(parseResponse("einschätzung: Vorhanden\nSchon abgedeckt.").verdict).toBe(
      "vorhanden",
    );
  });

  it("fällt auf 'unklar' zurück, wenn das Präfix fehlt", () => {
    expect(parseResponse("Das ist irgendein Text ohne Einschätzung.").verdict).toBe(
      "unklar",
    );
  });

  it("fällt auf 'unklar' zurück bei einem unbekannten Wert", () => {
    expect(parseResponse("EINSCHÄTZUNG: vielleicht\nText.").verdict).toBe("unklar");
  });

  it("kommt mit einer leeren Antwort zurecht", () => {
    expect(parseResponse("")).toEqual({ verdict: "unklar", text: "" });
  });

  it("nimmt die ganze Antwort als Text, wenn es keine zweite Zeile gibt", () => {
    expect(parseResponse("EINSCHÄTZUNG: aehnlich").text).toBe(
      "EINSCHÄTZUNG: aehnlich",
    );
  });
});
