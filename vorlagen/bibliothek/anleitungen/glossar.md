Pflege `glossar.txt`.

## Ein Ort, zwei Nutzen

Die Datei ist keine Dokumentation, sondern ein Werkzeug:

1. **Whisper bekommt sie als `hotwords`.** Steht „Elios 3" darin, schreibt
   die Transkription nicht mehr „Eliös 3" oder „Helios drei". Nachgemessen:
   derselbe Begriff, einmal ohne Glossar phonetisch falsch, mit Glossar
   richtig. Jeder Fehler im Transkript erbt sich in Kapitel,
   Zusammenfassung und Suche weiter — hier ist er am billigsten zu
   verhindern.
2. **Du selbst hältst dich daran**, damit dreißig Beiträge dieselben Wörter
   benutzen.

## Das Format

Ein Begriff je Zeile, sonst nichts. Keine Erklärungen, keine Aufzählungs-
zeichen, keine Überschriften — die Datei wird Wort für Wort an die
Transkription gegeben.

```
Elios 3
Zellspannung
Rotorschutz
Vorflugkontrolle
Messprotokoll
```

## Was hineingehört

- **Eigennamen von Geräten und Software**, in der Schreibweise des
  Herstellers: „Elios 3", nicht „Elios3" oder „elios 3".
- **Fachbegriffe, die Whisper falsch schreibt** — daran erkennbar, dass sie
  in den Transkripten in mehreren Varianten auftauchen.
- **Abkürzungen**, die gesprochen werden.
- Firmen-, Orts- und Personennamen, die regelmäßig vorkommen.

## Was nicht hineingehört

- Allgemeinsprache. „Akku" schreibt Whisper von sich aus richtig, und jedes
  überflüssige Wort verwässert die Wirkung der übrigen.
- Erklärungen oder Definitionen. Die gehören auf eine Themenseite.
- Beugungsformen desselben Wortes.
- **Mehr als etwa hundert Zeilen.** Eine lange Liste wirkt schlechter als
  eine kurze: das Modell verteilt seine Aufmerksamkeit, und
  Alltagsbegriffe verdrängen die seltenen Fachwörter, um die es geht.

## Wie du vorgehst

1. Lies `glossar.txt`, falls vorhanden.
2. Durchsuche die `transcript.json` nach Wörtern, die in mehreren
   Schreibweisen vorkommen — das sind die Kandidaten. `Grep` mit einem
   Teilwort findet die Varianten („lios" findet „Elios", „Eliös", „Helios").
3. Nimm die Titel und Schlagworte der Beiträge dazu: dort stehen die Namen
   schon in der Schreibweise, die Simon für richtig hält.
4. Schreibe die Datei sortiert (Eigennamen zuerst, dann alphabetisch) mit
   `Edit` beziehungsweise `Write`, falls sie noch nicht existiert. Diese
   Datei hat keine Marker — sie besteht nur aus der Liste, und du darfst sie
   als Ganzes schreiben.
5. **Entferne nichts, was schon dasteht**, ohne zu fragen. Ein Eintrag, den
   du für überflüssig hältst, kann genau der sein, der ein Problem gelöst
   hat.

## Zum Schluss

Nenne die hinzugefügten Begriffe und **wo du die falschen Schreibweisen
gefunden hast** (Beitrag und Zeit). Damit ist zu sehen, ob eine erneute
Transkription des Beitrags sich lohnt — mit dem Glossar wird sie besser.

Nenne auch die Begriffe, bei denen du die richtige Schreibweise **nicht
kennst**. Dort muss ein Mensch entscheiden; rate nicht.
