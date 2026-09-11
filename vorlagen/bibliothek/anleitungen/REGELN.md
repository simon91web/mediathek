# Diese Bibliothek

Das hier ist keine Programmier-Sitzung. Der Ordner ist die **Mediathek** —
eine Sammlung selbst aufgenommener Lehrmedien, und du bist hier, um sie zu
erschließen: Kapitel setzen, zusammenfassen, Bezüge finden, Themenseiten
pflegen.

Es gibt keine Datenbank. Alles steht in Textdateien:

```
medien/<slug>/beitrag.md          ← die Datei, die du bearbeitest
medien/<slug>/video.mp4|audio.m4a ← die Aufnahme; fehlt sie, ist es ein Text
medien/<slug>/transcript.json     ← deine Quelle (Segmente mit start/end/text)
medien/<slug>/anhaenge/**         ← PDFs, Infografiken, Präsentationen
themen/<slug>.md                  ← Wissensgebiete mit Synonymen und Fundstellen
sammlungen/<slug>.md              ← geordnete Wege durch Ausschnitte
fragen/<slug>.md                  ← beantwortete Fragen, mit Belegen
glossar.txt                       ← Fachbegriffe in korrekter Schreibweise
library.json                      ← GENERIERT. Nie anfassen, nie lesen.
```

## Die drei Regeln, die nicht verhandelbar sind

**1. Du schreibst nur zwischen Markern.**

```markdown
<!-- kapitel:start -->
00:00 Einleitung und Ziel
01:24 Akku prüfen
<!-- kapitel:ende -->
```

Alles außerhalb eines Markerpaars ist handgeschrieben und bleibt unberührt —
auch dann, wenn es dir verbesserungswürdig erscheint. Fehlt ein Markerpaar,
fügst du es am Ende der Datei an. Benutze `Edit`, nie `Write`: eine neu
geschriebene Datei hätte den handgeschriebenen Teil verloren.

Die Blöcke: `kapitel`, `zusammenfassung`, `kapitelzusammenfassungen`,
`bezuege`, `anhaenge` — in `themen/` zusätzlich `fundstellen`, in
`fragen/` der Block `antwort`.

**2. Du erfindest nichts.**

Die einzigen Quellen sind `transcript.json` (bei Video und Audio) und der
Text der `beitrag.md` selbst (bei Textbeiträgen). Was dort nicht gesagt wird,
steht nicht in der Zusammenfassung. Diese Aufnahmen sind unskriptiert; die
Versuchung, eine Lücke plausibel zu füllen, ist groß und wäre hier
Falschinformation — jemand handelt danach an einem Fluggerät.

Bist du unsicher, was gemeint ist, schreibst du weniger, nicht vageres.

**3. Deutsch, und zwar wie ein Kollege spricht.**

Alle Texte sind deutsch: Kapiteltitel, Zusammenfassungen, Begründungen von
Bezügen. Kein Werbeton, keine Superlative, keine Floskeln wie „In diesem
Video erfahren Sie". Fachbegriffe in der Schreibweise aus `glossar.txt`.

## Das Format der Kapitel

Kapitel sind **Zeilen im Text**, wie bei YouTube — kein zweiter Datenbestand:

```
00:00 Einleitung und Ziel
01:24 Akku prüfen
1:02:03 Nachbereitung
```

- `mm:ss` oder `h:mm:ss`, die Sekunden immer zweistellig.
- Die Zeit steht am **Zeilenanfang**. Ein Präfix (`-`, `*`, `1.`) ist
  erlaubt, aber unnötig.
- Ohne Titel ist es kein Kapitel.
- Aufsteigend sortiert, keine zwei Kapitel zur selben Zeit.

Bei **Textbeiträgen** gibt es keine Zeitkapitel: dort sind die Überschriften
(`##`, `###`) die Kapitel. Der `kapitel`-Block bleibt leer.

## Verweise

Eine Form für alles:

```
[[akku-pruefen]]                 der ganze Beitrag
[[akku-pruefen#12:40]]           eine Stelle
[[akku-pruefen#12:40-18:05]]     ein Ausschnitt
[[messprotokoll#fehlerbilder]]   ein Abschnitt in einem Textbeitrag
```

Der Slug ist der Ordnername unter `medien/`. Ein Verweis auf einen Slug, den
es nicht gibt, erzeugt in der Oberfläche eine Warnung — prüfe die Namen mit
`ls medien`.

**Rückverweise schreibst du nicht.** Die Mediathek berechnet sie: ein Bezug
wird an einer Stelle notiert und erscheint auf beiden Beiträgen. Trägst du
ihn zweimal ein, steht er doppelt da.

## Was du nie tust

- `library.json` ändern oder als Quelle benutzen (generierter Zwischenstand).
- Mediendateien, `transcript.json`, `transcript.vtt`, `poster.jpg` oder
  Anhänge verändern, verschieben oder löschen.
- Ordner unter `medien/` umbenennen — der Ordnername ist die Kennung, an der
  jeder Verweis hängt.
- Text außerhalb der Marker umformulieren.
- Eine `beitrag.md` neu schreiben, statt sie zu bearbeiten.

## Die Aufgaben

| Anleitung | Was sie beschreibt |
|---|---|
| `anleitungen/kapitel.md` | Kapitel, Gesamt- und Kapitelzusammenfassung für einen Beitrag |
| `anleitungen/kapitel-alle.md` | dasselbe für alle Beiträge ohne Kapitel, in einer Sitzung |
| `anleitungen/bezuege.md` | verwandte Stellen in allen anderen Beiträgen finden |
| `anleitungen/themen.md` | Themenseiten mit Synonymen und Fundstellen anlegen und pflegen |
| `anleitungen/glossar.md` | Fachbegriffe mit korrekter Schreibweise sammeln |
| `anleitungen/fragen.md` | gleichartige Fragen zu einem Eintrag zusammenfassen |

Jede dieser Dateien ist genauer als diese hier. Wer eine Aufgabe bekommt,
liest zuerst ihre Anleitung vollständig.

Sie setzen **kein bestimmtes Programm** voraus — sie beschreiben Dateien und
Formate. Welches Werkzeug die Arbeit macht, ist eine Einstellung der
Mediathek.
