Sammle Fachbegriffe als eigene Notizen unter `40_Glossar/`.

Ein Begriff ist keine Karte. Er hat keine geordnete Beitragsliste. Er hat
eine kanonische Schreibweise, andere Schreibweisen und eine kurze Definition.

## Die Datei

`40_Glossar/Erka-Control.md`

```markdown
---
typ: Begriff
begriff: Erka-Control
tags: [Erko-Control]
synonyme: [erko control]
aliases: [Erka Control]
hoerfehler: []
status: erschlossen
---

Die Software, mit der die Rotorschutz-Käfige geprüft werden.

## Fundstellen

- [[Vorflugkontrolle Elios 3#01:20 Rotorschutz montieren]]
```

- `begriff` ist die Form, die stimmt. Nur sie wird später als Whisper-Hotword
  verwendet.
- `aliases` ist der lesbare Dateiname: Bindestriche werden Leerzeichen,
  `Erka-Control` wird `Erka Control`. Fehlt so ein Unterschied, bleibt
  `aliases` leer.
- Eine andere echte Schreibweise aus einem Wort steht bei `tags`. Mehrere
  Wörter, die wirklich derselbe Name sind, stehen bei `synonyme`. Beides
  kommt nicht in die Hotword-Liste.
- Falsch gehört oder falsch gewählt steht bei `hoerfehler`, zum Beispiel
  `hoerfehler: [Nautilus, Nautik, Nautiq]` an `begriff: NautiQ`. Das ist
  keine zweite Bezeichnung. `wortlaut` zeigt, wo diese Formen im Bestand
  stehen. `wortlaut --anwenden` setzt Transkript und Prosa auf `begriff`.
  Befunde unter `70_Analysen/` bleiben stehen, das Frontmatter auch, damit
  die Liste sich nicht selbst löscht. `hoerfehler` wird kein Hotword.
- Die Definition darf auf andere Begriffe und auf Notizen verweisen.
- `## Fundstellen` ergänzen, nicht die Definition umschreiben, wenn schon
  eine da ist.
- Einen Begriff anlegen, wenn er in mindestens zwei Notizen vorkommt oder
  eine feste Schreibweise braucht, die man sonst verhört.

Keine `glossar.txt` im Vault schreiben. Die entsteht maschinenlokal aus dem
Feld `begriff`.
