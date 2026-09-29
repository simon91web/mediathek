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
- Eine andere Schreibweise aus einem Wort steht bei `tags`. Mehrere Wörter,
  auch falsch gehört, stehen bei `synonyme`. Beides kommt nicht in die
  Hotword-Liste.
- Die Definition darf auf andere Begriffe und auf Notizen verweisen.
- `## Fundstellen` ergänzen, nicht die Definition umschreiben, wenn schon
  eine da ist.
- Einen Begriff anlegen, wenn er in mindestens zwei Notizen vorkommt oder
  eine feste Schreibweise braucht, die man sonst verhört.

Keine `glossar.txt` im Vault schreiben. Die entsteht maschinenlokal aus dem
Feld `begriff`.
