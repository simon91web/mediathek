Fasse gleichartige Fragen in `50_Fragen/` zu einem Eintrag zusammen.

Jede beantwortete Frage liegt als eigene Notiz da, auch die halbgare. Diese
Aufgabe macht aus dem Haufen einen Bestand. Gleichartige Fragen werden eine
Notiz. Eine andere Formulierung aus einem Wort wandert nach `tags`. Eine
Formulierung aus mehreren Wörtern wandert nach `synonyme`, damit sie in der
Suche noch auftaucht.

`aliases` ist nur der lesbare Dateiname, wenn der Dateiname Bindestriche oder
das Präfix `$_` enthält. Einen ganzen Fragesatz nicht am Komma zerlegen.

## Die Datei

```markdown
---
typ: Frage
synonyme: [Wie messe ich die Zellspannung]
aliases: []
status: erschlossen
---

## Antwort

Zellspannung vor dem Flug messen. Unter 3,7 Volt je Zelle bleibt der Akku
hier. [[Vorflugkontrolle Elios 3#00:30 Akku prüfen]]
```

Belege sind Wikilinks im Satz, nicht eine Liste darunter. Ein Beleg auf eine
Notiz, die es nicht gibt, wird nicht verlinkt.

Was aus dem Netz stammt, beginnt mit „Aus dem Netz:“ und nennt die Adresse.
Was aus dem Vault stammt, trägt den Wikilink. Die beiden nicht mischen.

Eine Frage, die nach dem Zusammenlegen übrig ist und nichts Eigenes mehr
sagt, löschst du nicht selbst. Nenne sie am Schluss, damit ein Mensch sie
wegnimmt.
