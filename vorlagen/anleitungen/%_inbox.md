Sortiere ein, was in `00_Inbox/` liegt und dessen Urteil schon feststeht.

Lies zuerst `%_sichtung.md`. Ohne Urteil wird nichts verschoben.

## Neu, und der Name ist frei

1. Lege `10_Notizen/<Titel>.md` an. Der Titel kommt aus dem Dateinamen oder aus
   dem Urteil, nicht aus einer Vermutung über den Inhalt.
2. Die Mediendatei liegt in `20_Attachments/` und heißt wie die Notiz, mit ihrer Endung.
3. Die Notiz bekommt die Eigenschaften `typ: Medium`, `art`, `status: gesichtet`
   und einen kurzen handgeschriebenen Satz nur, wenn die Rohdatei schon Text
   mitbringt. Sonst bleibt der Kopf leer bis auf die Eigenschaften und den
   Embed `![[<Titel>.mp4]]` oder die passende Audio-Endung.
4. `## Kapitel`, `## Zusammenfassung`, `## Bezüge` und `## Transkript` leer
   anlegen. Füllen tut sie die Kette, nicht dieser Schritt.
5. Die Rohdatei verlässt die Inbox.

## Ähnlich oder vorhanden

Bleibt in der Inbox. Schreibe eine Zeile in `00_Inbox/_sichtung.md` mit dem
Wikilink auf die bestehende Notiz und dem vorgeschlagenen Namen. Ein Mensch
bestätigt, ob es eine neue Notiz wird oder ein Anhang.

## PDF und andere Anhänge

Ohne klares Ziel bleiben sie liegen. In `_sichtung.md` steht, an welche
Notiz sie sich hängen könnten. Nicht an eine Notiz anfügen, solange das
nicht bestätigt ist.

## Nie

- Eine bestehende Notiz überschreiben.
- Zwei Aufnahmen ineinander schieben, weil sie sich ähnlich anhören.
- Eine Datei löschen.
