Räume `fragen/` auf: fasse zusammen, was dasselbe meint.

## Warum es diese Aufgabe gibt

In `fragen/` landet **jede** Frage, die im Chat beantwortet wurde —
automatisch, ohne dass jemand entschieden hätte, ob sie es wert ist. Das ist
Absicht: eine Frage, über deren Ablage man nachdenken muss, wird nicht
gestellt.

Der Preis ist ein Haufen. Dieselbe Sache steht darin dreimal, in drei
Formulierungen, mit drei verschieden guten Antworten. Deine Aufgabe ist, aus
dem Haufen einen Bestand zu machen — ohne dass etwas verloren geht.

## Erst lesen

1. Alle `fragen/*.md`. Das ist der Arbeitsvorrat.
2. Die belegten Beiträge (`medien/<slug>/transcript.json`), wo du eine
   Antwort prüfen oder zusammenführen musst.
3. `glossar.txt` für die Schreibweisen.

## Die Datei

`fragen/<slug>.md`, Slug kleingeschrieben mit Bindestrichen
(`ä`→`ae`, `ö`→`oe`, `ü`→`ue`, `ß`→`ss`):

```markdown
---
frage: Wie lese ich die Trajectory-Datei?
auch gefragt:
  - Was steht eigentlich in der Trajectory?
  - Trajectory-Spalten, was bedeuten die?
gefragt: 2026-09-11
quellen: [bibliothek]
---

<!-- antwort:start -->
Die Trajectory enthält je Zeitstempel Position und Rotation
[[cloud-compare-1#04:25]]. Ihr Zeitstempel beginnt nicht bei null; die
Differenz zum Video ist der Offset, ohne den die Zuordnung um Sekunden
danebenliegt [[cloud-compare-1#07:10-08:00]].
<!-- antwort:ende -->
```

## Was zusammengehört

Zwei Fragen sind dieselbe, wenn **dieselbe Antwort beide beantwortet**. Nicht,
wenn sie dasselbe Thema haben.

- „Was steht in der Trajectory?" und „Trajectory-Spalten, was bedeuten die?"
  → dieselbe Frage.
- „Was steht in der Trajectory?" und „Wie rechne ich den Video-Offset aus?"
  → verwandt, aber **zwei Fragen**. Zusammengelegt verliert man die zweite.

Im Zweifel: **nicht** zusammenlegen. Zwei Einträge, die sich ähneln, sind ein
Schönheitsfehler; eine verschluckte Frage ist ein Verlust.

## So fasst du zusammen

1. Wähle die Datei, deren Frage am **allgemeinsten und klarsten** formuliert
   ist. Sie bleibt; ihr Slug bleibt (Links darauf sollen weiter stimmen).
2. Trage die Formulierungen der anderen unter `auch gefragt:` ein — jede
   einzeln, wörtlich wie gestellt. Das ist der Grund, warum das Zusammenlegen
   nichts kostet: wer die zweite Formulierung sucht, findet sie hier wieder.
3. Schreibe **eine** Antwort zwischen die Marker, die alle
   zusammengelegten Fragen beantwortet. Nimm aus jeder Fassung, was sie
   Richtiges beiträgt; wo zwei sich widersprechen, geh ins Transkript und
   entscheide anhand des Belegs.
4. Behalte alle Belege, die noch stimmen. Doppelte Belege auf dieselbe Stelle
   einmal.
5. Steht in einer der Dateien `quellen: [bibliothek, web]`, muss das auch in
   der zusammengefassten stehen, sobald eine Aussage aus dem Netz übernommen
   wurde.
6. **Lösche die aufgegangenen Dateien.** Erst danach, und erst wenn alles
   übernommen ist.

## Die Antwort

- **Nichts erfinden.** Steht es weder in der Bibliothek noch in den bisherigen
  Antworten, schreib es nicht hin.
- **Belege als Verweis im Fließtext**: `[[kennung#mm:ss]]` — die Kennung ist
  der Ordnername unter `medien/`, die Zeit der `start` eines echten Segments.
  Sie werden angeklickt und springen ins Video; eine erfundene Zeitmarke ist
  schlimmer als keine.
- Bei Textbeiträgen `[[kennung#abschnitts-anker]]`, ohne Stelle `[[kennung]]`.
- Prüfe jeden übernommenen Verweis: gibt es `medien/<kennung>/`? Zeigt die
  Zeit auf die Stelle, die gemeint ist? Verweise ins Leere entfernst du und
  sagst es zum Schluss.
- Kurz. Drei bis zehn Sätze. Wer mehr braucht, soll das Video ansehen — dafür
  ist der Verweis da.
- Deutsch, sachlich, ohne Einleitungsfloskeln.

## Was du nie tust

- Eine Frage löschen, ohne dass ihr Inhalt woanders steht.
- Die Formulierung einer Frage „verbessern", ohne die alte unter
  `auch gefragt:` zu sichern.
- Außerhalb der Marker schreiben. Alles außerhalb ist Kopf und bleibt Kopf.
- Eine Antwort mit Wissen von außen anreichern, das nicht in der Bibliothek
  steht — es sei denn, es stand schon in der Antwort und `quellen:` nennt
  das Netz.
- Eine Datei mit `Write` neu schreiben, wenn `Edit` reicht.

## Zum Schluss

Nenne:

- welche Dateien zusammengefasst wurden und welche Frage jeweils blieb,
- welche Verweise du als ungültig entfernt hast,
- welche Fragen dir aufgefallen sind, die **keine gute Antwort** haben — das
  ist die Liste der Lücken in der Bibliothek und damit die Antwort auf „was
  sollte ich als nächstes aufnehmen?".
