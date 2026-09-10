import { describe, expect, it } from "vitest";

import { foldTerm, parseQuery, tokenize } from "./normalize";

describe("foldTerm", () => {
  it("schreibt deutsche Umlaute aus", () => {
    expect(foldTerm("Aufblähung")).toBe("aufblaehung");
    expect(foldTerm("Prüfer")).toBe("pruefer");
    expect(foldTerm("Größe")).toBe("groesse");
    expect(foldTerm("Öl")).toBe("oel");
  });

  it("findet dieselbe Form aus beiden Richtungen", () => {
    // Genau das ist der Zweck: die Anfrage darf ohne Umlaut getippt werden.
    expect(foldTerm("aufblaehung")).toBe(foldTerm("Aufblähung"));
    expect(foldTerm("PRUEFER")).toBe(foldTerm("Prüfer"));
  });

  it("entfernt andere Diakritika", () => {
    expect(foldTerm("Café")).toBe("cafe");
    expect(foldTerm("naïve")).toBe("naive");
  });

  it("lässt Ziffern stehen", () => {
    expect(foldTerm("Elios 3")).toBe("elios 3");
    expect(foldTerm("3,7 Volt")).toBe("3,7 volt");
  });
});

describe("tokenize", () => {
  it("trennt am Bindestrich", () => {
    // So findet "Elios" auch "Elios-3".
    expect(tokenize("Elios-3")).toEqual(["Elios", "3"]);
  });

  it("behält Ziffern als eigene Begriffe", () => {
    expect(tokenize("3,7 Volt je Zelle")).toEqual([
      "3",
      "7",
      "Volt",
      "je",
      "Zelle",
    ]);
  });

  it("kommt mit Satzzeichen und Leerraum aus", () => {
    expect(tokenize("  Akku, Zelle!  ")).toEqual(["Akku", "Zelle"]);
    expect(tokenize("")).toEqual([]);
  });
});

describe("parseQuery", () => {
  it("faltet einzelne Begriffe", () => {
    expect(parseQuery("Aufblähung Akku")).toEqual({
      terms: ["aufblaehung", "akku"],
      phrases: [],
    });
  });

  it("hebt Wortgruppen in Anführungszeichen heraus", () => {
    const parsed = parseQuery('"Akku prüfen" zelle');
    expect(parsed.phrases).toEqual(["Akku prüfen"]);
    expect(parsed.terms).toEqual(["zelle"]);
  });

  it("kommt mit mehreren Wortgruppen aus", () => {
    const parsed = parseQuery('"eins zwei" und "drei vier"');
    expect(parsed.phrases).toEqual(["eins zwei", "drei vier"]);
    expect(parsed.terms).toEqual(["und"]);
  });

  it("liefert bei leerer Anfrage nichts", () => {
    expect(parseQuery("   ")).toEqual({ terms: [], phrases: [] });
  });
});
