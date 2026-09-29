Finde für die genannte Notiz, was im übrigen Vault damit zu tun hat.

## Erst lesen

1. Die Notiz und ihre `transcript.json`. Nicht nach dem Titel gehen, nach
   dem Gesagten.
2. Die Transkripte der anderen Notizen, bei Textnotizen deren Text. Bei
   vielen Notizen erst nach den Fachbegriffen suchen, dann die Fundstelle
   im Zusammenhang lesen.
3. Die Dateien in `30_Themen/`. Ihre Aliase sagen, welche Wörter dieselbe Sache
   meinen.

## Was ein guter Bezug ist

Ein Bezug ist eine Aussage über zwei Stellen, nicht eine Wortübereinstimmung.
Würde jemand, der hier gerade zuhört, dort weiterlesen wollen?

Gute Bezüge: dieselbe Sache aus anderer Richtung, eine Voraussetzung, ein
Widerspruch, dasselbe Fehlerbild an einem anderen Gerät.

Keine Bezüge: „beide erwähnen die Elios 3“, zwei Stellen mit demselben Wort
ohne Zusammenhang, der Nachbar auf derselben Karte. Den zeigt die Karte selbst.

Höchstens fünf. Lieber drei.

## Dann schreiben

Nur unter `## Bezüge` der genannten Notiz. Ein Bezug ist ein zugeklappter
Callout. Die sichtbare Beschriftung nennt den Notiznamen und die
Kapitelüberschrift, der Embed spielt die Stelle.

```markdown
## Bezüge

> [!info]- [[Studio#00:00 Drei Wege für Kunden- und Pilotendaten|Studio, 00:00 Drei Wege für Kunden- und Pilotendaten]]
> Dieselbe Trennung von der anderen Seite: Kundendaten laufen über das HiDrive, die Bearbeitung liegt im Studio.
>
> ![[Studio.mp4#t=108,176|01:48]]
```

- `[!info]-` bleibt zugeklappt. Zwischen zwei Bezügen steht eine Leerzeile.
- Der Link nennt die Kapitelüberschrift so, wie sie in der Zieldatei steht,
  inklusive ihrer Zeit. Die Zeit gehört zum Ziel, nicht zu dieser Notiz.
- Darunter ein Satz, warum diese Stelle hier weiterhilft. „Verwandtes Thema“
  ist keiner.
- Der Embed nennt die Mediendatei, die die Zielnotiz selbst einbettet. Fehlt
  die, nimm `<Titel>.mp4` oder `<Titel>.mp3` aus `20_Attachments`.
- `#t=` nimmt zwei ganze Sekunden, Anfang und Ende, durch Komma. Kein
  Minutenformat darin. `108,176` ist 01:48 bis 02:56, denn 1×60+48 = 108 und
  2×60+56 = 176. Hinter `|` steht nur der Anfang, als `mm:ss` oder `h:mm:ss`,
  Sekunden zweistellig.
- Der Bereich ist das Kapitel, soweit die Aussage darin liegt. Der Anfang ist
  der `start` des ersten Segments, das dazu gehört, auf die ganze Sekunde
  abgerundet. Das kann später sein als die Überschrift: `00:00` öffnet das
  Kapitel, die Aussage beginnt bei 01:48. Das Ende ist die Zeit der nächsten
  Kapitelüberschrift. Gibt es keine, nimm die `dauer` der Notiz.
- Bei einer Textnotiz gibt es keinen Embed. Der Callout verlinkt die
  Abschnittsüberschrift und enthält nur den Satz:

  ```markdown
  > [!info]- [[Messprotokoll lesen#Akku und Spannung|Messprotokoll lesen, Akku und Spannung]]
  > Dort wird die Zellspannungsmessung erklärt
  ```
- Den Bezug nur hier eintragen. Die Gegenrichtung zeigt Obsidian als
  verlinkte Erwähnung.
- Ein vorhandener Bezug bleibt, wenn sein Ziel noch existiert. Steht er noch
  als Aufzählung mit nur einem Zeitpunkt, schreib ihn in diesen Callout um.
  Die Aussage bleibt.

Prüfe die Dateinamen. Ein Verweis ins Leere hilft niemandem.

Zusätzlich darfst du einen Wikilink auf einen Begriff oder eine Karte setzen,
wenn der Name oder ein Alias im Transkript steht und der Bezug trägt. Was du
nicht verlinkst, bleibt eine unverlinkte Erwähnung. Das ist in Ordnung.

## Zum Schluss

Nenne die Bezüge, die du eingetragen hast, und die, die du erwogen und
verworfen hast.
