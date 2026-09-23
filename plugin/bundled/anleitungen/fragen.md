Fasse gleichartige Fragen in `Fragen/` zu einem Eintrag zusammen.

Jede beantwortete Frage liegt als eigene Notiz da, auch die halbgare. Diese
Aufgabe macht aus dem Haufen einen Bestand. Gleichartige Fragen werden eine
Notiz. Die anderen Formulierungen wandern nach `aliases`, damit die zweite
Formulierung die Antwort noch findet.

`aliases` nicht am Komma in der Anleitung zerlegen. Dort stehen ganze Sätze.

## Die Datei

```markdown
---
typ: Frage
aliases:
  - Wie messe ich die Zellspannung
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
