---
description: Kapitel, Zusammenfassung und Kapitelzusammenfassungen für einen Beitrag
argument-hint: <slug>
---

Erschließe den Beitrag `$1`.

## Erst lesen

1. `medien/$1/beitrag.md` — was steht schon da? Handgeschriebene
   Beschreibung, vorhandene Kapitel, Schlagworte, Dauer.
2. `medien/$1/transcript.json` — die Quelle. Ein Feld `segments`, jedes mit
   `start`, `end`, `text`.
3. `glossar.txt` — die verbindliche Schreibweise der Fachbegriffe.

Gibt es keine `transcript.json`, ist der Beitrag entweder ein Textbeitrag
(dann ist der Body der `beitrag.md` die Quelle) oder noch nicht
transkribiert. Im zweiten Fall **brich ab** und sage, dass die Transkription
in der Mediathek angestoßen werden muss — rate nicht anhand des Titels.

## Dann schreiben

Drei Blöcke in `medien/$1/beitrag.md`, mit `Edit`, ausschließlich zwischen
den Markern.

### Kapitel

```markdown
<!-- kapitel:start -->
00:00 Einleitung und Ziel
01:24 Akku prüfen
<!-- kapitel:ende -->
```

Verbindlich:

- **Jede Zeit ist der `start` eines echten Segments.** Runde nicht auf
  „schöne" Zeiten und interpoliere nicht. Nimm den `start` des Segments, in
  dem das neue Thema beginnt, auf die ganze Sekunde abgerundet.
- **Das erste Kapitel liegt bei `00:00`**, auch wenn dort Begrüßung oder
  Räuspern steht. Eine Zeitleiste, die erst bei 00:47 anfängt, sieht kaputt
  aus.
- **Mindestens 45 Sekunden je Kapitel.** Kürzeres ist ein Nebensatz, kein
  Kapitel.
- **Menge nach Länge:** bis 10 Minuten 3–6 Kapitel, bei 30 Minuten 6–12, bei
  60 bis 90 Minuten 10–20. Mehr hilft niemandem beim Navigieren.
- **Titel 3–8 Wörter**, ohne Nummerierung, ohne Punkt am Ende. Sie benennen
  den Gegenstand, nicht die Handlung: „Akku prüfen", nicht „Jetzt schauen wir
  uns den Akku an".
- **Aufsteigend, keine Dopplungen.**

Stehen schon Kapitel da, sind sie wahrscheinlich von Hand gesetzt: übernimm
sie unverändert und ergänze nur dazwischen. Ein von Hand gesetztes Kapitel
ist eine Entscheidung, keine Vorlage.

### Zusammenfassung

```markdown
<!-- zusammenfassung:start -->
Drei bis sechs Sätze über den ganzen Beitrag.
<!-- zusammenfassung:ende -->
```

Was jemand wissen muss, um zu entscheiden, ob er das ansehen will — und was
er mitnimmt, wenn nicht. Konkrete Zahlen aus dem Transkript gehören hinein
(„unter 3,7 Volt je Zelle"), sie sind das Wertvollste daran. Keine
Einleitung über die Einleitung.

### Kapitelzusammenfassungen

```markdown
<!-- kapitelzusammenfassungen:start -->
### 01:24 Akku prüfen
Zellspannung messen, auf Aufblähung und Temperatur achten. Ein Akku unter
3,7 Volt je Zelle geht nicht mit ins Feld.
<!-- kapitelzusammenfassungen:ende -->
```

Die Überschrift trägt **dieselbe Zeit und denselben Titel** wie die
Kapitelzeile — daran wird zugeordnet. Ein bis drei Sätze je Kapitel. Für ein
Kapitel, in dem nichts Merkfähiges gesagt wird, lässt du den Eintrag weg;
eine leere Höflichkeitsformel ist schlechter als nichts.

## Zum Schluss

Sage in zwei Sätzen, was du geschrieben hast, und **nenne ausdrücklich, wo
du unsicher warst** — an welcher Stelle das Transkript unklar ist, welcher
Fachbegriff phonetisch falsch geschrieben scheint. Das ist die Stelle, an
der ein Mensch nachsehen muss.

Fällt dir dabei ein Fachbegriff auf, der in `glossar.txt` fehlt oder dort
anders steht, sage das ebenfalls — trage ihn aber nicht selbst ein, dafür
ist `/glossar` da.
