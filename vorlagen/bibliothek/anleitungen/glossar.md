Sammle die Fachbegriffe dieser Bibliothek als eigene Dateien in `glossar/`.

## Ein Ort, drei Nutzen

Ein Begriff ist keine Dokumentation, sondern ein Werkzeug — und zwar auf drei
Arten gleichzeitig:

1. **Whisper bekommt die kanonischen Begriffe als `hotwords`.** Steht "Elios
   3" darin, schreibt die Transkription nicht mehr "Eliös 3" oder "Helios
   drei". `glossar.txt` wird aus `glossar/*.md` GENERIERT — **schreib diese
   Datei nie selbst**, sie entsteht beim nächsten Einlesen von allein.
2. **Schreibweisen erweitern die Suche**, genau wie Themen-Synonyme: wer
   "Erka-Control" sucht, findet damit auch die Stelle, an der Whisper
   "erko-control" transkribiert hat — ohne dass das Transkript selbst
   angefasst wird.
3. **Die Definition macht daraus ein Nachschlagewerk** für Kollegen, die den
   Begriff nicht kennen — mit Querverweisen auf Beiträge und auf andere
   Begriffe.

## Die Datei

`glossar/<slug>.md`, Slug kleingeschrieben mit Bindestrichen
(`ä`→`ae`, `ö`→`oe`, `ü`→`ue`, `ß`→`ss`):

```markdown
---
begriff: Erka-Control
schreibweisen: [Erko-Control, erko control]
---

Die Software, mit der die Rotorschutz-Käfige geprüft werden.

<!-- fundstellen:start -->
- [[akku-grundlagen#00:15]] Erwähnt im Zusammenhang mit der Zellprüfung
<!-- fundstellen:ende -->
```

### begriff

Die kanonische Schreibweise — in der Form des Herstellers oder wie Simon sie
benutzt, nicht wie Whisper sie zufällig verhört.

### schreibweisen

Andere Formen, **auch falsch transkribierte**. Anders als bei einer
Themenseite gehört hier ausdrücklich hinein, was Whisper daneben schreibt —
genau das macht die Suche robust gegen den Fehler, ohne das Transkript
anzufassen. Nimm auf:

- Varianten, die in `transcript.json` tatsächlich auftauchen,
- Abkürzungen und ausgeschriebene Formen,
- englische Entsprechungen, wenn sie im Betrieb benutzt werden.

### Definition

Ein bis drei Sätze, aus dem, was in den Beiträgen gesagt wird — kein
Lehrbuchwissen von außen. Darf `[[wikilinks]]` auf Beiträge UND auf andere
Begriffe enthalten (dieselbe Klammer, die Mediathek löst zuerst gegen einen
Begriff auf, dann gegen einen Beitrag). Darf auch leer bleiben — ein Begriff
ohne Definition ist immer noch nützlich für die Suche und für Whisper.

### Fundstellen

Wie bei einer Themenseite: nur im Marker-Block, alles außerhalb ist
handgeschrieben. Besonderheit hier: eine Fundstelle darf auch **die Stelle
sein, an der die falsche Schreibweise gefunden wurde** — das macht sichtbar,
wo sich eine erneute Transkription lohnt.

## Wie du vorgehst

1. Lies `glossar.txt`, falls vorhanden, und die vorhandenen `glossar/*.md`.
   Ein Begriff aus `glossar.txt`, der noch keine eigene Datei hat, bekommt
   jetzt eine — das ist die Migration vom alten Format, keine Ausnahme.
2. Durchsuche `transcript.json` nach Wörtern, die in mehreren Schreibweisen
   vorkommen — das sind die Kandidaten. `Grep` mit einem Teilwort findet die
   Varianten ("lios" findet "Elios", "Eliös", "Helios").
3. Nimm die Titel und Schlagworte der Beiträge dazu: dort steht die
   Schreibweise, die Simon für richtig hält.
4. Für einen NEUEN Begriff: `Write` eine neue `glossar/<slug>.md` mit
   `begriff`, den gefundenen `schreibweisen` und — wenn aus den Beiträgen
   erkennbar — einer kurzen Definition.
5. Für einen BESTEHENDEN Begriff: `Edit`, nie `Write` — sonst geht die
   handgeschriebene Definition verloren. Ergänze `schreibweisen` und den
   Fundstellen-Block, ändere `begriff` nur, wenn du dir sicher bist.
6. **Entferne nichts, was schon dasteht**, ohne zu fragen. Eine Schreibweise,
   die du für überflüssig hältst, kann genau die sein, die ein Problem gelöst
   hat.

## Was hineingehört — was nicht

Wie bisher: Eigennamen von Geräten und Software, Fachbegriffe, die Whisper
falsch schreibt, Abkürzungen, Firmen-/Orts-/Personennamen. NICHT: Allgemein-
sprache, Beugungsformen, mehr als etwa hundert Begriffe insgesamt — eine
lange Liste wirkt beim Transkribieren schlechter als eine kurze.

## Was du nie tust

- `glossar.txt` von Hand schreiben oder ändern — sie ist generiert.
- Eine bestehende `glossar/*.md` mit `Write` neu schreiben.
- Eine Definition erfinden, die nicht aus den Beiträgen hervorgeht.
- Einen Begriff löschen, weil du ihn für überflüssig hältst. Sag es
  stattdessen.

## Zum Schluss

Nenne die angelegten und geänderten Begriffe, und **wo du die falschen
Schreibweisen gefunden hast** (Beitrag und Zeit). Damit ist zu sehen, ob eine
erneute Transkription des Beitrags sich lohnt — mit dem Glossar wird sie
besser.

Nenne auch die Begriffe, bei denen du die richtige Schreibweise **nicht
kennst**. Dort muss ein Mensch entscheiden; rate nicht.
