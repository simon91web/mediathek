# Regeln

Das hier ist keine Programmier-Sitzung. Der Ordner ist eine Mediathek. Du
erschließt sie: Kapitel setzen, zusammenfassen, Bezüge finden, Karten
pflegen, Lücken benennen.

Es gibt keine Datenbank. Alles sind Dateien:

```
Medien/<Titel>.md                 die Notiz
Medien/<Titel>.mp4|m4a            der Film oder die Sprachmemo
Medien/<Titel>.transcript.json    Segmente mit start, end, text
$_<Name>.md                       Map of Content
Glossar/<Begriff>.md
Fragen/<Frage>.md
Sammlungen/<Name>.md              nur von Hand
Analysen/Vollständigkeit.md
Inbox/                            Rohdateien, noch keine Notiz
```

## Die drei Regeln

**1. Du schreibst nur unter den Werkzeug-Überschriften.**

`## Kapitel`, `## Zusammenfassung`, `## Bezüge`, `## Transkript`. Alles
darüber ist handgeschrieben und bleibt unberührt, auch wenn es dir
verbesserungswürdig erscheint. Fehlt eine dieser Überschriften, fügst du sie
am Ende an. Bearbeite die Datei. Schreibe sie nicht neu, sonst ist der
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
in der Schreibweise aus `Glossar/`.

## Kapitel

```markdown
## Kapitel

### 00:00 Einleitung und Ziel
### 01:24 Akku prüfen
### 1:02:03 Nachbereitung
```

- `mm:ss` oder `h:mm:ss`, die Sekunden immer zweistellig.
- Die Zeit ist der Anfang der Überschrift, Ebene 3, unter `## Kapitel`.
- Ohne Titel ist es kein Kapitel.
- Aufsteigend, keine zwei Kapitel zur selben Zeit.
- Der Text unter der Überschrift ist die Kapitelzusammenfassung, ein bis
  drei Sätze. Fehlt etwas Merkfähiges, bleibt der Abschnitt leer.

Bei einer Textnotiz gibt es keine Zeit. Dort sind `##` und `###` die
Abschnitte. `## Kapitel` bleibt dann weg.

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

## Was du nie tust

- Mediendateien, `transcript.json` oder Anhänge verändern, verschieben oder
  löschen.
- Eine Notiz umbenennen, deren Name schon in Verweisen steht, es sei denn,
  du ziehst die Verweise mit.
- Text über der ersten Werkzeug-Überschrift umformulieren.
- Eine bestehende Notiz neu schreiben, statt sie zu bearbeiten.
- `![[Datei.mp4#t=…]]` einfügen. Obsidian springt damit bei lokalen Dateien
  nicht. Die Zeit steht in der Überschrift. Der Embed oben in der Notiz ist
  `![[<Titel>.mp4]]`, einmal, ohne Fragment.

## Die Aufgaben

| Anleitung | Was sie beschreibt |
|---|---|
| `anleitungen/inbox.md` | Rohdateien sichten und, wenn bestätigt, einsortieren |
| `anleitungen/sichtung.md` | neu, ähnlich oder vorhanden |
| `anleitungen/kapitel.md` | Kapitel und Zusammenfassung einer Notiz |
| `anleitungen/kapitel-alle.md` | alle Notizen ohne Kapitel |
| `anleitungen/bezuege.md` | verwandte Stellen |
| `anleitungen/themen.md` | Maps of Content |
| `anleitungen/glossar.md` | Begriffe |
| `anleitungen/fragen.md` | Fragen zusammenfassen |
| `anleitungen/vollstaendigkeit.md` | Lücken mit Beleg |
