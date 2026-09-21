import { describe, expect, it } from "vitest";

import { parseQuery } from "./normalize";
import { buildSynonymGroups, expandQuery } from "./synonyms";

const THEMEN = [
  {
    kind: "thema" as const,
    slug: "zellspannungsmessung",
    title: "Zellspannungsmessung",
    synonyms: ["Balancing", "Spannungsspreizung", "Zellprüfer"],
  },
  {
    kind: "thema" as const,
    slug: "rotorschutz",
    title: "Rotorschutz",
    synonyms: ["Käfig", "Schutzkorb"],
  },
  // Ein Thema ohne Synonyme kann nichts erweitern.
  { kind: "thema" as const, slug: "vorflug", title: "Vorflugkontrolle", synonyms: [] },
];

const gruppen = buildSynonymGroups(THEMEN);

function erweitere(anfrage: string) {
  return expandQuery(parseQuery(anfrage), gruppen);
}

describe("buildSynonymGroups", () => {
  it("nimmt nur Quellen mit mindestens zwei Formen", () => {
    expect(gruppen.map((group) => group.source.slug)).toEqual([
      "zellspannungsmessung",
      "rotorschutz",
    ]);
  });

  it("nimmt den Titel als eine der Formen", () => {
    expect(gruppen[0].forms).toContain("Zellspannungsmessung");
  });

  it("entdoppelt Formen, die sich nur in der Faltung unterscheiden", () => {
    const [group] = buildSynonymGroups([
      {
        kind: "thema",
        slug: "x",
        title: "Aufblähung",
        synonyms: ["aufblaehung", "Blähen"],
      },
    ]);
    expect(group.forms).toEqual(["Aufblähung", "Blähen"]);
  });

  it("nimmt auch Glossarbegriffe mit ihren Schreibweisen", () => {
    const [group] = buildSynonymGroups([
      {
        kind: "glossar",
        slug: "erka-control",
        title: "Erka-Control",
        synonyms: ["Erko-Control", "erko control"],
      },
    ]);
    expect(group.source).toEqual({
      kind: "glossar",
      slug: "erka-control",
      title: "Erka-Control",
    });
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

  it("nennt die Quelle, aus der die Erweiterung kommt", () => {
    const [first] = erweitere("käfig");
    expect(first.source).toEqual({
      kind: "thema",
      slug: "rotorschutz",
      title: "Rotorschutz",
    });
  });

  it("findet eine falsch transkribierte Glossar-Schreibweise", () => {
    const groups = buildSynonymGroups([
      {
        kind: "glossar",
        slug: "erka-control",
        title: "Erka-Control",
        synonyms: ["Erko-Control"],
      },
    ]);
    const expansions = expandQuery(parseQuery("erka-control"), groups);
    expect(expansions.map((entry) => entry.term)).toEqual(["Erko-Control"]);
    expect(expansions[0].source.kind).toBe("glossar");
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
        kind: "thema",
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
        kind: "thema",
        slug: "viel",
        title: "Viel",
        synonyms: Array.from({ length: 20 }, (_, i) => `Wort${i}xyz`),
      },
    ]);
    expect(expandQuery(parseQuery("viel"), groups)).toHaveLength(8);
  });
});
