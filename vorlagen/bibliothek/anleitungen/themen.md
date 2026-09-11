Lege die Wissensgebiete dieser Bibliothek als Themenseiten an — oder pflege
ein einzelnes genanntes Thema.

## Warum das der wichtigste Befehl ist

Ein Thema ist der Einstieg in ein Wissensgebiet: es sammelt, was in
verschiedenen Beiträgen über dieselbe Sache gesagt wird. Und seine
**Synonyme erweitern die Suchanfrage** — wer „Balancing" sucht, findet damit
die Stelle, an der „Zellspannung" gesagt wurde. Das ist der einzige Weg der
Mediathek zu bedeutungsnaher Suche. Die Qualität dieser Listen ist die
Qualität der Suche.

Ein Thema ist **kein Kurs**. Niemand arbeitet es durch.

## Erst lesen

1. Alle `transcript.json` und die `beitrag.md` der Textbeiträge. Bei vielen
   Beiträgen: erst die Zusammenfassungen und Kapiteltitel überfliegen, dann
   gezielt in die Transkripte.
2. Die vorhandenen `themen/*.md` — was ist schon erfasst?
3. `glossar.txt` für die Schreibweisen.

## Ein Thema ist es wert, wenn

- es in **mindestens zwei Beiträgen** vorkommt (sonst ist es ein Kapitel),
- man danach suchen würde, ohne den Beitrag zu kennen,
- und es einen Namen hat, den ein Kollege benutzen würde.

Zehn bis dreißig Themen sind für eine Bibliothek dieser Art richtig. Bei
hundert Themen ist jedes eines zu viel.

## Die Datei

`themen/<slug>.md`, Slug kleingeschrieben mit Bindestrichen
(`ä`→`ae`, `ö`→`oe`, `ü`→`ue`, `ß`→`ss`):

```markdown
---
titel: Zellspannungsmessung
synonyme: [Balancing, Spannungsspreizung, Zellprüfer]
schlagworte: [akku]
---

Die Zellspannung ist die aussagekräftigste Einzelgröße am Akku. Wichtig ist
nicht der Mittelwert, sondern die Spreizung zwischen der höchsten und der
niedrigsten Zelle.

<!-- fundstellen:start -->
- [[akku-grundlagen#00:15]] Das Messgerät und der Ablauf
- [[vorflugkontrolle-elios-3#00:30-01:20]] Im Ablauf der Vorflugkontrolle
- [[messprotokoll-lesen#akku-und-spannung]] Wie es ins Protokoll kommt
<!-- fundstellen:ende -->
```

### Synonyme

Andere Wörter für **dieselbe Sache** — nicht Verwandtes, nicht Oberbegriffe.
„Balancing" und „Zellspannungsmessung" meinen dasselbe; „Akku" ist ein
Oberbegriff und gehört nicht hierher. Ein zu weites Synonym flutet jede
Suche mit Fremdtreffern.

Vier bis acht sind richtig. Nimm auf:

- die Wörter, die **im Gesprochenen** vorkommen (auch umgangssprachliche:
  „Käfig" für „Rotorschutz"),
- Abkürzungen und ausgeschriebene Formen,
- englische Entsprechungen, wenn sie im Betrieb benutzt werden.

Schreibweise wie üblich, nicht kleingeschrieben — sie werden angezeigt.
Umlaute sind der Suche gleichgültig, du musst sie nicht doppelt führen.

### Erklärung

Zwei bis fünf Sätze, was das Gebiet ausmacht. Aus dem, was in den Beiträgen
gesagt wird — **kein Lehrbuchwissen von außen**. Wird ein Grenzwert genannt,
gehört er hierher.

### Fundstellen

Die Stellen, an denen es in dieser Bibliothek um dieses Gebiet geht.

- Nur im Marker-Block; alles außerhalb ist handgeschrieben. **Außerhalb** der
  Marker stehen die geordneten ganzen Beiträge, die jemand von Hand
  eingetragen hat — die rührst du nicht an.
- Jede Zeit ist der `start` eines echten Segments. Ausschnitte
  (`#12:40-18:05`) da, wo ein zusammenhängendes Stück dazu gehört.
- Bei Textbeiträgen der Abschnittsanker.
- Eine Zeile Begründung: was an DIESER Stelle über das Gebiet gesagt wird.
- Nach Wichtigkeit ordnen, nicht nach Beitrag. Die erste Fundstelle ist die,
  an die man jemanden schicken würde.
- Fünf bis fünfzehn. Nicht jede Erwähnung.

## Was du nie tust

- Ein Thema anlegen, das nur in einem Beitrag vorkommt.
- Beiträge außerhalb des Marker-Blocks ergänzen oder umsortieren.
- Eine `themen/*.md` mit `Write` neu schreiben — sonst ist der
  handgeschriebene Teil weg. `Edit`.
- Ein Thema löschen, weil du es für überflüssig hältst. Sag es stattdessen.

## Zum Schluss

Liste, welche Themen du angelegt und welche du geändert hast, jeweils mit der
Zahl der Fundstellen. Nenne die Gebiete, die du **erkannt, aber nicht
angelegt** hast, weil sie nur in einem Beitrag vorkommen — das ist die Liste
der Lücken in der Bibliothek und damit die Antwort auf „was sollte ich als
nächstes aufnehmen?".
