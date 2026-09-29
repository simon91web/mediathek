Lege ein Thema an oder pflege eines.

Eine Karte ist der Einstieg in ein Wissensgebiet. Sie sammelt, was in
verschiedenen Notizen über dieselbe Sache gesagt wird. Sie ist kein Kurs.
Niemand arbeitet sie durch.

Die Datei liegt in `30_Themen/` und heißt `$_<Name>.md`, zum Beispiel
`30_Themen/$_Zellspannung.md`. `aliases` ist der lesbare Name ohne `$_` und ohne
Bindestriche: aus `$_Flyability-Workspace-Struktur` wird `Flyability Workspace
Struktur`. Ein einzelnes weiteres Wort steht bei `tags`. Mehrere Wörter
gehören nach `synonyme`, weil ein Obsidian-Tag kein Leerzeichen enthalten
darf. Wer „Balancing“ sucht, findet die Karte über den Tag. Die Obsidian-Suche springt
davon nicht in eine Transkriptstelle, die das Wort nicht enthält. Dafür ist
die Karte da, und dafür sind die Verweise darin da.

## Eine Karte ist es wert, wenn

- die Sache in mindestens zwei Notizen vorkommt,
- man danach suchen würde, ohne die Notiz zu kennen,
- und sie einen Namen hat, den ein Kollege benutzt.

Zehn bis dreißig Karten sind für einen Bestand dieser Art richtig.

## Erst lesen

1. Die Zusammenfassungen und Kapiteltitel, dann gezielt die Transkripte.
2. Die vorhandenen Dateien in `30_Themen/`.
3. `40_Glossar/` für die Schreibweisen.

## Die Datei

```markdown
---
typ: Thema
tags: [akku, Balancing, Zellprüfer]
aliases: [Zellspannung]
status: erschlossen
---

Worum es geht, in wenigen Sätzen. Von Hand, und von dir nur, wenn der
Abschnitt noch leer ist.

## Notizen

- [[Vorflugkontrolle Elios 3]]

## Fundstellen

- [[Vorflugkontrolle Elios 3#00:30 Akku prüfen]] Zellspannung vor dem Flug
```

`## Notizen` sind ganze Beiträge in der Reihenfolge, in der man sie ansehen
würde. `## Fundstellen` sind einzelne Stellen. Die beiden nicht vermischen.

Eine Fundstelle verweist auf eine Kapitelüberschrift, die es gibt. Eine
Karte bekommt keine Mediendatei und keinen Embed.

Vorhandene Einträge bleiben. Du ergänzt. Du sortierst eine handgeschriebene
Reihenfolge nicht um.
