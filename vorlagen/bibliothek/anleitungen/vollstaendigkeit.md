Finde lose Enden: wo ist ein Thema nicht zu Ende gedacht, wo widerspricht sich
die Bibliothek selbst, wo fehlt ein Zusammenhang ganz.

## Worum es NICHT geht

Ob ein Thema **breit genug** ist — genug Fundstellen, eine Beschreibung, jedes
Synonym auch belegt — berechnet die Mediathek selbst, ohne dich. Deine Aufgabe
ist die andere Hälfte, die kein Textabgleich leisten kann: **Tiefe und
Präzision** für jemanden, der die Sache schon kennt.

Und: du beurteilst NICHT, ob eine Aussage nach deinem eigenen Wissen über die
Welt richtig ist. Diese Bibliothek dokumentiert firmenspezifische Praxis
(Elios/NautiQ-Hardware, UNITECHNICS-eigene Abläufe) — Dinge, die du aus deinem
Training nicht kennen kannst. Eine „Korrektur" auf dieser Grundlage wäre öfter
falsch als die Stelle, die sie korrigiert. Geprüft wird deshalb **nur, was
sich innerhalb der Bibliothek selbst belegen lässt**: ein Widerspruch
zwischen zwei eigenen Beiträgen, eine Zahl ohne eigene Quelle, ein Versprechen
im eigenen Material, das nie eingelöst wurde.

## Erst lesen

1. `themen/*.md` — welche Themen gibt es, welche Beiträge und Fundstellen
   gehören dazu.
2. Für jedes Thema die `transcript.json` (und bei Textbeiträgen `beitrag.md`)
   der zugehörigen Beiträge. Die Kapitelzusammenfassungen sind der schnelle
   Überblick, das Transkript die Quelle für einen genauen Beleg.
3. `fragen/*.md` — eine Frage ohne befriedigende Antwort ist oft derselbe
   Befund wie ein offener Verweis, nur schon einmal gestellt.

## Die vier Kategorien

Jeder Befund gehört in genau eine davon:

- **Widerspruch** — zwei Beiträge sagen zur selben Sache Unterschiedliches
  (ein Grenzwert, eine Reihenfolge, eine Empfehlung).
- **Unbelegte Zahl** — ein Grenzwert, eine Messgröße oder eine Frist wird
  genannt, ohne dass irgendwo im Material steht, woher sie kommt.
- **Nur Normalfall behandelt** — ein Ablauf wird erklärt, aber kein
  Fehlerfall, keine Ausnahme, kein „was, wenn nicht" dazu.
- **Offener Verweis** — eine Stelle kündigt etwas an („mehr dazu später",
  „siehe nächstes Video") oder eine Frage in `fragen/` hat keine belastbare
  Antwort, und nichts im späteren Material löst das ein.

**Jeder Befund braucht mindestens einen Beleg** — bei einem Widerspruch zwei,
je einen pro Seite. Ein Befund ohne Beleg wird beim Einlesen automatisch
verworfen; ihn trotzdem hinzuschreiben ist also verlorene Arbeit.

## Unverortete Fäden

Zusätzlich: Begriffe oder Vorgänge, die in mehreren Beiträgen auftauchen,
aber zu keinem Thema in `themen/` gehören. Das sind Kandidaten für ein neues
Thema, keine Kritik an einem bestehenden.

## Die Datei

Schreibe (mit `Write`, nicht `Edit` — die Datei wird bei jedem Lauf komplett
neu erzeugt) nach `analysen/vollstaendigkeit.md`. Lege den Ordner an, falls er
fehlt.

```markdown
Zuletzt geprüft: 2026-09-18T14:32:00Z

## [[akku-grundlagen]]

### Unbelegte Zahl
- „Zellspannung darf 3,0 V nicht unterschreiten" wird genannt, aber nicht
  hergeleitet oder mit einer Quelle versehen. [[akku-grundlagen-1#03:12]]

### Widerspruch
- Unterschiedliche Angaben zur Mindest-Ladeschwelle vor dem Einsatz.
  [[akku-grundlagen-1#01:40]] [[vorflugkontrolle-2#04:55]]

## [[balancing]]

## Unverortete Fäden

- Kompass-Kalibrierung, in vier Kapiteln erwähnt, in keinem Thema gebündelt.
  [[vorflugkontrolle-1#02:10]] [[kalibrierung-2#00:45]]
```

Wichtig für dieses Format:

- **Die erste Zeile** ist immer `Zuletzt geprüft: ` mit dem heutigen Datum als
  ISO-Zeitstempel (Uhrzeit nach bestem Wissen, sie muss nicht auf die Sekunde
  stimmen).
- **Jedes Thema aus `themen/` bekommt eine eigene Überschrift** `## [[slug]]`
  — auch dann, wenn dir nichts aufgefallen ist. Ein Thema OHNE Überschrift
  gilt als „noch nie geprüft"; ein Thema MIT Überschrift, aber ohne
  Kategorien darunter, gilt als „geprüft, nichts gefunden". Der Unterschied
  ist der ganze Sinn dieser Zeile — bitte keines auslassen.
- Die Kategorie-Überschriften sind `### Widerspruch`, `### Unbelegte Zahl`,
  `### Nur Normalfall behandelt`, `### Offener Verweis` — genau so
  geschrieben, sonst wird der Abschnitt nicht erkannt.
- Ein Befund ist eine `- `-Zeile, ein bis zwei Sätze, danach ihre Belege als
  gewöhnliche Verweise (`[[akku-grundlagen-1#03:12]]`). Mehrere Belege in
  derselben Zeile, durch ein Leerzeichen getrennt.
- Die letzte Überschrift ist `## Unverortete Fäden`, danach eine `- `-Liste
  wie bei den Befunden.
- Nichts außerhalb dieser Datei anfassen — insbesondere keine `beitrag.md`
  und keine `themen/*.md`. Diese Aufgabe schreibt nur einen Bericht, sie
  ändert nichts an der Bibliothek selbst.

## Zum Schluss

Nenne kurz, wie viele Themen du geprüft hast und bei wie vielen dir nichts
aufgefallen ist — das ist die ehrlichere Auskunft als eine lange Fundliste.
