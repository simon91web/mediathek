Erschließe die genannte Notiz.

## Erst lesen

1. Die Notiz unter `Medien/`. Was steht über `## Kapitel` schon da?
2. Die gleichnamige `transcript.json`. Ein Feld `segments`, jedes mit
   `start`, `end`, `text`.
3. `Glossar/` für die Schreibweise der Fachbegriffe. Maßgeblich ist das Feld
   `begriff`, nicht die Aliase.

Gibt es keine `transcript.json`, ist es entweder eine Textnotiz (dann ist
ihr eigener Text die Quelle) oder sie ist noch nicht transkribiert. Im
zweiten Fall brich ab. Rate nicht anhand des Titels.

## Dann schreiben

Nur unter den Werkzeug-Überschriften, mit Bearbeitung, nicht mit einer neu
geschriebenen Datei.

### Kapitel

```markdown
## Kapitel

### 00:00 Einleitung und Ziel

### 01:24 Akku prüfen

Zellspannung messen. Ein Akku unter 3,7 Volt je Zelle geht nicht mit ins Feld.
```

- Jede Zeit ist der `start` eines echten Segments, auf die ganze Sekunde
  abgerundet. Nicht auf schöne Zeiten runden, nicht interpolieren.
- Das erste Kapitel liegt bei `00:00`.
- Mindestens 45 Sekunden je Kapitel. Kürzeres ist ein Nebensatz.
- Bis 10 Minuten 3–6 Kapitel, bei 30 Minuten 6–12, bei 60 bis 90 Minuten
  10–20.
- Titel 3–8 Wörter, ohne Nummer, ohne Punkt am Ende. „Akku prüfen“, nicht
  „Jetzt schauen wir uns den Akku an“.
- Aufsteigend, keine Dopplungen.
- Stehen schon Kapitel da, sind sie wahrscheinlich von Hand gesetzt. Übernimm
  sie und ergänze nur dazwischen.

Die Sätze unter der Überschrift sind die Kapitelzusammenfassung. Für ein
Kapitel ohne merkfähigen Inhalt lässt du sie weg.

### Zusammenfassung

```markdown
## Zusammenfassung

Drei bis sechs Sätze über die ganze Notiz.
```

Was jemand wissen muss, um zu entscheiden, ob er das ansehen will. Konkrete
Zahlen aus dem Transkript gehören hinein.

## Zum Schluss

Nenne die Kapitel mit ihren Zeiten. Sag, wenn du abgebrochen hast, weil das
Transkript fehlt.
