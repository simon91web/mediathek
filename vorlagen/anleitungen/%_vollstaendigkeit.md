Finde lose Enden. Wo ist ein Thema nicht zu Ende gedacht, wo widerspricht
sich der Bestand, wo fehlt ein Zusammenhang.

## Worum es nicht geht

Ob eine Karte breit genug ist, rechnet das Werkzeug selbst. Deine Aufgabe
ist Tiefe und Präzision für jemanden, der die Sache kennt.

Du beurteilst nicht, ob eine Aussage nach deinem Weltwissen stimmt. Dieser
Bestand dokumentiert firmeneigene Praxis. Geprüft wird nur, was sich
innerhalb des Vaults belegen lässt.

## Erst lesen

1. die Dateien in `30_Themen/`
2. Für jede Karte die Transkripte der verlinkten Notizen. Die
   Kapitelzusammenfassungen sind der Überblick, das Transkript die Quelle.
3. `50_Fragen/`

## Die vier Kategorien

Jeder Befund gehört in genau eine:

- **Widerspruch.** Zwei Notizen sagen zur selben Sache Unterschiedliches.
- **Unbelegte Zahl.** Ein Grenzwert, eine Messgröße oder eine Frist, ohne
  dass irgendwo steht, woher sie kommt.
- **Nur Normalfall behandelt.** Ein Ablauf ohne Fehlerfall und ohne Ausnahme.
- **Offener Verweis.** Eine Stelle kündigt etwas an, oder eine Frage hat
  keine belastbare Antwort, und nichts späteres löst das ein.

Jeder Befund braucht mindestens einen Beleg, ein Widerspruch zwei. Ein
Befund ohne Beleg wird verworfen.

Zusätzlich: Begriffe oder Vorgänge, die in mehreren Notizen auftauchen und
auf keiner Karte stehen. Das sind Kandidaten für eine neue `$_`-Datei.

## Die Notiz

Es gibt keine eigene Berichtnotiz. Stand und Hinweis stehen an der
betroffenen Notiz oder dem Thema, in den Eigenschaften.

`status` und `hinweis` für fehlendes Transkript, fehlende Kapitel und
fehlende Fundstellen setzt das Werkzeug aus den Dateien. Die fasst du nicht
an.

Findest du einen inhaltlichen Befund, schreibst du an genau diese Notiz
einen Satz in `hinweis`, mit Wikilink auf die Stelle. Sonst nichts an der
Notiz ändern. Mehrere Befunde zur selben Notiz: ein Satz, der beide nennt.

```yaml
hinweis: Unter 3,7 Volt je Zelle wird genannt und nirgends hergeleitet. [[Vorflugkontrolle Elios 3#00:30 Akku prüfen]]
```
