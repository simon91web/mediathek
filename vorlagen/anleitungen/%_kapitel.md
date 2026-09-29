Erschließe die genannte Notiz.

## Erst lesen

1. Die Notiz unter `10_Notizen/`. Was steht über `## Notizen` schon da?
2. Die gleichnamige `transcript.json`. Ein Feld `segments`, jedes mit
   `start`, `end`, `text`.
3. `40_Glossar/` für die Schreibweise der Fachbegriffe. Maßgeblich ist das Feld
   `begriff`, nicht die Aliase.

Gibt es keine `transcript.json` und eine Aufnahme liegt in
`20_Attachments/`, brich diese Notiz ab und nenne den Auftrag
`transkribieren`. Rate nicht anhand des Titels. Ist es eine Textnotiz, ist
ihr eigener Text die Quelle, und es gibt keine Kapitel.

## Dann schreiben

Bearbeiten, nicht neu schreiben, damit der handgeschriebene Teil bleibt.
Zusammenfassung als Callout oben, Kapitel als Callouts unter `## Notizen`.
Das erste ist aufgeklappt, der Rest zugeklappt. Darin `### mm:ss Titel` und
der Clip.

```markdown
> [!abstract]+ Zusammenfassung
> Drei bis sechs Sätze über die ganze Notiz.

## Notizen
> [!note]+ Kapitel 1: Akku prüfen
> ### 00:00 Akku prüfen
> Zellspannung messen. Ein Akku unter 3,7 Volt je Zelle geht nicht mit ins Feld.
>
> ![[Vorflugkontrolle Elios 3.mp4#t=0,84|Kapitel 1: Akku prüfen]]
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
- Der Clip läuft von dieser Kapitelzeit bis zur nächsten, beim letzten bis
  `dauer`, in ganzen Sekunden.
- Stehen schon Kapitel da, sind sie wahrscheinlich von Hand gesetzt. Übernimm
  sie und ergänze nur dazwischen.

Die Sätze unter der Überschrift sind die Kapitelzusammenfassung. Für ein
Kapitel ohne merkfähigen Inhalt lässt du sie weg. Die Zusammenfassung oben
ist, was jemand wissen muss, um zu entscheiden, ob er das ansehen will.
Konkrete Zahlen aus dem Transkript gehören hinein.

Quelle und Transkript, wenn sie noch fehlen: zugeklapptes Callout `Quelle`
mit der ganzen Aufnahme ohne Zeit, darunter `Transkript` mit einer Zeile je
Segment, `[[Datei.mp4#t=mm:ss|mm:ss]]` und der gesprochene Wortlaut.

## Zum Schluss

Nenne die Kapitel mit ihren Zeiten. Sag, wenn du abgebrochen hast, weil das
Transkript fehlt.
