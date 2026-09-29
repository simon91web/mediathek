# Regeln

Das hier ist keine Programmier-Sitzung. Der Ordner ist eine Mediathek. Du
erschließt sie: Kapitel setzen, zusammenfassen, Bezüge finden, Karten
pflegen, Lücken benennen.

Es gibt keine Datenbank. Alles sind Dateien:

```
10_Notizen/<Titel>.md                die Notiz
20_Attachments/<Titel>.mp4|mp3       der Film oder die Sprachmemo
10_Notizen/<Titel>.transcript.json   Segmente mit start, end, text
30_Themen/$_<Name>.md                Thema, Map of Content
40_Glossar/<Begriff>.md
50_Fragen/<Frage>.md
60_Sammlungen/<Name>.md              nur von Hand
70_Analysen/Vollständigkeit.md
00_Inbox/                            Rohdateien, noch keine Notiz
```

## Die drei Regeln

**1. Du schreibst nur unter den Werkzeugteilen.**

Zusammenfassung, `## Notizen`, `## Bezüge`, `# Quelle und Transkript`.
Die Form der Aufnahme steht in der Anleitung dieses Auftrags. Alles darüber
ist handgeschrieben und bleibt unberührt, auch wenn es dir
verbesserungswürdig erscheint. Fehlt ein Werkzeugteil, fügst du ihn am Ende
an. Bearbeite die Datei. Schreibe sie nicht neu, sonst ist der
handgeschriebene Teil weg.

Keine HTML-Kommentare als Schreibfenster. Muss eine Stelle im Fließtext
markiert werden, setze einen Inline-Tag, etwa `#luecke`.

**2. Du erfindest nichts.**

Quellen sind `transcript.json` und, bei einer Textnotiz, der Text der Notiz
selbst. Was dort nicht gesagt wird, steht nicht in der Zusammenfassung. Diese
Aufnahmen sind unskriptiert. Eine plausibel gefüllte Lücke wäre
Falschinformation. Bist du unsicher, schreibst du weniger.

**3. Deutsch, wie ein Kollege spricht.**

Kapiteltitel, Zusammenfassungen, Begründungen. Kein Werbeton. Fachbegriffe
in der Schreibweise aus `40_Glossar/`.

## Kapitel

Callouts unter `## Notizen`, das erste aufgeklappt, darin `### mm:ss Titel`,
darunter der Clip der Aufnahme. Die Muster stehen in `%_kapitel.md` und
`%_inbox.md`.

- `mm:ss` oder `h:mm:ss`, die Sekunden immer zweistellig.
- Die Zeit ist der Anfang der Überschrift. Ohne Titel ist es kein Kapitel.
- Aufsteigend, keine zwei Kapitel zur selben Zeit.
- Der Text unter der Überschrift ist die Kapitelzusammenfassung, ein bis
  drei Sätze. Fehlt etwas Merkfähiges, bleibt der Abschnitt leer.

Bei einer Textnotiz ohne Aufnahme gibt es keine Kapitel. Der mitgebrachte
Text bleibt, darunter `## Bezüge`.

## Verweise

```
[[Akku-Grundlagen]]
[[Vorflugkontrolle Elios 3#00:30 Akku prüfen]]
[[Messprotokoll lesen#Akku und Spannung]]
```

Der Name ist der Dateiname ohne `.md`. Ein Verweis auf eine Map of Content
trägt das Präfix mit: `[[$_Zellspannung]]`.

**Die Gegenrichtung schreibst du nicht.** Obsidian zeigt sie als verlinkte
Erwähnung. Steht derselbe Bezug in beiden Notizen, steht er doppelt.

Ein Bezug unter `## Bezüge` ist kein Aufzählungspunkt. Er ist der zugeklappte
Callout aus `%_bezuege.md`. Die sichtbare Beschriftung nennt den Notiznamen.
Kapitel und Bezüge tragen den Bereich als `![[Datei.mp4#t=<Start>,<Ende>]]`,
zwei ganze Sekunden. Die ganze Aufnahme steht einmal im Callout Quelle, ohne
Zeit.

## Was du nie tust

- Mediendateien, `transcript.json` oder Anhänge verändern, verschieben oder
  löschen.
- Eine Notiz umbenennen, deren Name schon in Verweisen steht, es sei denn,
  du ziehst die Verweise mit.
- Text über dem ersten Werkzeugteil umformulieren.
- Eine bestehende Notiz neu schreiben, statt sie zu bearbeiten.
- Den Embed der Quelle mit einer Zeit versehen oder die Datei ein zweites Mal
  ganz einbetten. Ein Bereichs-Embed gehört in ein Kapitel oder einen Bezug.

## Die Aufgaben

Der Auftrag enthält den Text der Aufgabe. Ein Verweis wie `%_kapitel.md` meint
den gleichnamigen Abschnitt in demselben Auftrag. Die Dateien selbst liegen im
Mediathek-Repo unter `vorlagen/anleitungen/`.
