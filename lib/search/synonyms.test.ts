import { describe, expect, it } from "vitest";

import { parseQuery } from "./normalize";
import { buildSynonymGroups, expandQuery } from "./synonyms";

const THEMEN = [
  {
    slug: "zellspannungsmessung",
    title: "Zellspannungsmessung",
    synonyms: ["Balancing", "Spannungsspreizung", "Zellprüfer"],
  },
  {
    slug: "rotorschutz",
    title: "Rotorschutz",
    synonyms: ["Käfig", "Schutzkorb"],
  },
  // Ein Thema ohne Synonyme kann nichts erweitern.
  { slug: "vorflug", title: "Vorflugkontrolle", synonyms: [] },
];

const gruppen = buildSynonymGroups(THEMEN);

function erweitere(anfrage: string) {
  return expandQuery(parseQuery(anfrage), gruppen);
}

describe("buildSynonymGroups", () => {
  it("nimmt nur Themen mit mindestens zwei Formen", () => {
    expect(gruppen.map((group) => group.topic.slug)).toEqual([
      "zellspannungsmessung",
      "rotorschutz",
    ]);
  });

  it("nimmt den Titel als eine der Formen", () => {
    expect(gruppen[0].forms).toContain("Zellspannungsmessung");
  });

  it("entdoppelt Formen, die sich nur in der Faltung unterscheiden", () => {
    const [group] = buildSynonymGroups([
      { slug: "x", title: "Aufblähung", synonyms: ["aufblaehung", "Blähen"] },
    ]);
    expect(group.forms).toEqual(["Aufblähung", "Blähen"]);
  });
});

describe("expandQuery", () => {
  it("erweitert ein Synonym um die übrigen Formen", () => {
    const expansions = erweitere("balancing");
    expect(expansions.map((entry) => entry.term)).toEqual([
      "Zellspannungsmessung",
      "Spannungsspreizung",
      "Zellprüfer",
    ]);
  });

  it("erweitert auch vom Titel aus", () => {
    const expansions = erweitere("zellspannungsmessung");
    expect(expansions.map((entry) => entry.term)).toEqual([
      "Balancing",
      "Spannungsspreizung",
      "Zellprüfer",
    ]);
  });

  it("nennt das Thema, aus dem die Erweiterung kommt", () => {
    const [first] = erweitere("käfig");
    expect(first.topic).toEqual({ slug: "rotorschutz", title: "Rotorschutz" });
  });

  it("ist gegenüber Umlauten gleichgültig", () => {
    // "kaefig" muss dieselbe Gruppe treffen wie "käfig".
    expect(erweitere("kaefig").map((entry) => entry.term)).toEqual([
      "Rotorschutz",
      "Schutzkorb",
    ]);
  });

  it("löst nicht auf eine Wortmitte aus", () => {
    /*
     * Der wichtige Unterschied zum wörtlichen Suchkanal: dort ist die
     * Wortmitte gewollt, hier wäre sie fatal. "Balancingfehler" ist ein
     * anderes Wort, und eine Anfrage wie "fahren" darf nicht wegen "Ah"
     * eine Gruppe aufziehen.
     */
    expect(erweitere("balancingfehler")).toEqual([]);
  });

  it("erweitert nicht um etwas, das schon in der Anfrage steht", () => {
    const expansions = erweitere("balancing zellprüfer");
    expect(expansions.map((entry) => entry.term)).not.toContain("Zellprüfer");
  });

  it("erkennt eine mehrwortige Form als Folge", () => {
    const groups = buildSynonymGroups([
      {
        slug: "x",
        title: "Zellspannung messen",
        synonyms: ["Spannungsprüfung"],
      },
    ]);
    const expansions = expandQuery(
      parseQuery("wie man zellspannung messen sollte"),
      groups,
    );
    expect(expansions.map((entry) => entry.term)).toEqual([
      "Spannungsprüfung",
    ]);
  });

  it("erweitert eine Wortgruppe in Anführungszeichen genauso", () => {
    expect(erweitere('"balancing"').map((entry) => entry.term)).toContain(
      "Zellspannungsmessung",
    );
  });

  it("bleibt bei einer Anfrage ohne Bezug still", () => {
    expect(erweitere("rotorblatt")).toEqual([]);
    expect(erweitere("")).toEqual([]);
  });

  it("erweitert höchstens achtmal", () => {
    const groups = buildSynonymGroups([
      {
        slug: "viel",
        title: "Viel",
        synonyms: Array.from({ length: 20 }, (_, i) => `Wort${i}xyz`),
      },
    ]);
    expect(expandQuery(parseQuery("viel"), groups)).toHaveLength(8);
  });
});
