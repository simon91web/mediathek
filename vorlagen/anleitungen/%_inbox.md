Eine Notiz in `00_Inbox/` wird in einem Durchgang fertig. Der Inhalt ist egal:
Fließtext, ein Film, eine Sprachmemo, ein Bild, mehrere davon, gemischt.

Du urteilst und arbeitest weiter. Auf eine Bestätigung wartest du nicht.
Steht `%_sichtung.md` vor diesem Abschnitt, ist das der erste Schritt, kein Halt.

## Urteil

Lies die Inbox-Datei, die Aufnahmen, auf die sie zeigt, und die Notizen und
Karten, die der Name oder der Inhalt nahelegen.

- Neuer Inhalt, auch wenn ein Thema schon eine Notiz hat: eigene Notiz.
- Dieselbe Aufnahme oder derselbe Text liegt schon unter `10_Notizen/`:
  nicht ein zweites Mal anlegen. Sag das. Die Rohdatei bleibt liegen.
- Der Dateiname ist schon eine Notiz: nicht überschreiben. Sag das. Die
  Rohdatei bleibt liegen.

## Eine Aufnahme, eine Notiz

Der Titel kommt aus dem Dateinamen. Bei einer Aufnahme ist das der Name der
Mediendatei, bei reinem Text der Name der Inbox-Notiz. Keinen treffenderen
Titel erfinden.

Eine Inbox-Notiz mit einer Aufnahme und mitgebrachtem Text bleibt eine
Notiz. Der Text steht oben und bleibt im Wortlaut. Darunter kommt die Form
der Aufnahme.

Mehrere Aufnahmen in einer Inbox-Notiz werden mehrere Notizen, eine je
Aufnahme. Der mitgebrachte Text bleibt eine eigene Textnotiz. Bilder bleiben
in dieser Textnotiz. Die Aufnahmen hängen dort als Bezüge, mit dem Namen der
Zielnotiz in der sichtbaren Überschrift des Callouts.

## Medium und Transkript

Die Mediendatei liegt in `20_Attachments/` und heißt wie die Notiz. Liegt
sie noch in der Inbox, verschiebst du sie dorthin. Eine Datei, die schon
richtig liegt, bleibt liegen.

Fehlt bei einer Aufnahme die `transcript.json`, wird sie erzeugt. Dafür ist
`tools/transcribe.py` im Mediathek-Repo, Aufruf wie der Auftrag
`transkribieren`. Die Datei landet neben der Notiz:
`10_Notizen/<Titel>.transcript.json`, Segmente mit `start`, `end`, `text`.
Der gesprochene Wortlaut bleibt. Ein Hörfehler wird in der Zusammenfassung
geglättet, im Transkript nicht. Misslingt das Transkript, brich ab und sag
das. Kein Transkript aus dem Titel oder dem mitgebrachten Text ableiten.

`dauer` ist die abgerundete Länge als `mm:ss` oder `h:mm:ss`. `aufgenommen`
nur, wenn der Dateiname oder der mitgebrachte Text ein Datum hergibt.
`260924` ist der 24.09.2026. Sonst das Feld weglassen.

## Die Form

Zeilenenden LF. Vorlage für eine Aufnahme ist diese Form. Das erste Kapitel
ist aufgeklappt, der Rest zugeklappt. Die Überschrift `### mm:ss Titel`
bleibt im Callout, damit ein Verweis auf das Kapitel aufgeht.

```markdown
---
typ: Medium
art: Video
tags: []
dauer: 18:19
aliases: []
status: erschlossen
ausbau: dicht
---
> [!abstract]+ Zusammenfassung
> Drei bis sechs Sätze. Was jemand wissen muss, um zu entscheiden, ob er das ansehen will.

## Notizen
> [!note]+ Kapitel 1: Pfad aus dem HiDrive
> ### 05:16 Pfad aus dem HiDrive
> Ein bis drei Sätze, nur das, was gesagt wurde.
>
> ![[Stand UNIVERSE 260924.mp4#t=316,412|Kapitel 1: Pfad aus dem HiDrive]]

> [!note]- Kapitel 2: Nächster Abschnitt
> ### 06:52 Nächster Abschnitt
> …
>
> ![[Stand UNIVERSE 260924.mp4#t=412,515|Kapitel 2: Nächster Abschnitt]]

## Bezüge

> [!info]- [[Studio#13:26 Studio als Werkzeugkasten für Drohnenprojekte|Studio, 13:26 Studio als Werkzeugkasten für Drohnenprojekte]]
> Ein Satz, warum man dort weiterliest.
>
> ![[Studio.mp4#t=806,892|13:26]]

# Quelle und Transkript

> [!example]- Quelle
> ![[Stand UNIVERSE 260924.mp4]]

> [!abstract]- Transkript
> [[Stand UNIVERSE 260924.mp4#t=00:01|00:01]] Gesprochener Text des Segments.
```

`art` ist `Video`, `Audio` oder `Text`. Bei Audio dieselbe Form, mit der
passenden Endung.

Eine Textnotiz ohne Aufnahme bekommt keine erfundenen Kapitel und kein
Transkript. Der mitgebrachte Text bleibt. Darunter nur die Bezüge.

```markdown
---
typ: Medium
art: Text
tags: []
aliases: []
status: erschlossen
ausbau: dicht
---

Der mitgebrachte Text, unverändert.

## Bezüge

> [!info]- [[Konzept UNIVERSE und Studio#02:00 Universe, Modul und Studio|Konzept UNIVERSE und Studio, 02:00 Universe, Modul und Studio]]
> Ein Satz in der Sache.
>
> ![[Konzept UNIVERSE und Studio.mp4#t=120,237|02:00]]
```

`ausbau: dicht`, wenn ein Kollege mit der Notiz arbeiten kann. `ausbau:
ausbauen` und `status: offen`, wenn die Aufnahme fehlt oder unbrauchbar ist.
Dann ein Satz in `hinweis`. Ein Platzhalter, den die Notiz schon mitbringt,
bleibt stehen.

## Kapitel

- Das erste Kapitel beginnt bei `00:00`, auch wenn die Sprache eine Sekunde
  später einsetzt.
- Jede weitere Zeit ist der `start` eines echten Segments, auf die ganze
  Sekunde abgerundet.
- Mindestens 45 Sekunden. Kürzeres bleibt im Nachbarkapitel.
- Bis 10 Minuten 3–6 Kapitel, bei 30 Minuten 6–12, bei 60 bis 90 Minuten
  10–20.
- Titel 3–8 Wörter, ohne Nummer, ohne Punkt am Ende.
- Der Clip eines Kapitels läuft von dessen Überschrift bis zur nächsten,
  beim letzten bis `dauer`, in ganzen Sekunden. `#t=` nimmt diese zwei
  Zahlen, durch Komma. Hinter `|` steht die Kapitelbeschriftung.
- Die Sätze darunter nur aus dem, was gesagt wurde.

## Bezüge

Höchstens fünf, lieber drei. Ein Bezug ist eine Aussage über zwei Stellen.
Dieselbe Sache aus anderer Richtung, eine Voraussetzung, ein Widerspruch.
Dieselbe Vokabel in beiden Notizen reicht nicht. Der Nachbar auf derselben
Karte reicht nicht, den zeigt die Karte. Die Einzelheiten stehen in
`%_bezuege.md`.

- Ziel ist eine Überschrift, die es gibt: `[[Notiz#mm:ss Titel]]`.
- Die sichtbare Beschriftung nennt den Notiznamen, dann die Kapitelüberschrift.
  Zugeklappt muss man sehen, wohin der Bezug geht.
- Der Clip zeigt die Zielaufnahme. Anfang und Ende sind ganze Sekunden.
  Der Anfang kann später liegen als die Kapitelüberschrift, wenn die Aussage
  dort erst beginnt. Das Ende ist die nächste Kapitelüberschrift des Ziels,
  sonst dessen `dauer`. Hinter `|` steht nur der Anfang, als `mm:ss`.
- Den Bezug nur in der Notiz eintragen, die du gerade schreibst. Die
  Gegenrichtung zeigt Obsidian als verlinkte Erwähnung.
- Vorhandene Bezüge bleiben, wenn ihr Ziel noch existiert.
- Ein Wikilink auf eine Karte oder einen Begriff ist erlaubt, wenn der Bezug
  trägt. Was du nicht verlinkst, bleibt eine unverlinkte Erwähnung.

Keine Karte unter `30_Themen/` und kein Glossareintrag in diesem Durchgang.
Dafür sind `%_themen.md` und `%_glossar.md`.

## Zum Schluss

Die Rohdatei verlässt die Inbox, sobald ihr Inhalt in `10_Notizen/` liegt.
Medien, `transcript.json` und Bilder werden nicht gelöscht.

Nenne die angelegten Notizen, die Bezüge und das, was du erwogen und
verworfen hast. Sag, wenn ein Name schon belegt war oder die Aufnahme gefehlt
hat.

## Nie

- Eine bestehende Notiz überschreiben.
- Zwei Aufnahmen in eine Notiz schieben.
- Eine Mediendatei oder ein Transkript löschen. Verschieben nur die Aufnahme
  aus der Inbox nach `20_Attachments/`.
- Mitgebrachten Text umschreiben.
- Inhalt erfinden, der weder im Transkript noch im mitgebrachten Text steht.
