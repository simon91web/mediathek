Finde für den genannten Beitrag, was in der übrigen Bibliothek damit zu tun hat.

## Worum es geht

Diese Aufnahmen sind unskriptiert. Was in Beitrag 7 nebenbei erwähnt wird,
ist an Beitrag 2 die Hauptsache — und niemand findet es wieder. Genau diese
Verbindungen sollst du herstellen.

## Erst lesen

1. `medien/<slug>/beitrag.md` und `medien/<slug>/transcript.json` — worum geht es
   hier wirklich? Nicht nach dem Titel gehen, nach dem Gesagten.
2. Die `transcript.json` der **anderen** Beiträge, und bei Textbeiträgen
   deren `beitrag.md`. Bei vielen Beiträgen: erst mit `Grep` nach den
   Fachbegriffen dieses Beitrags suchen, dann die Fundstellen im
   Zusammenhang lesen.
3. `themen/*.md` — die Synonyme dort sagen dir, welche verschiedenen Wörter
   dieselbe Sache meinen.

## Was ein guter Bezug ist

Ein Bezug ist eine **Aussage über zwei Stellen**, nicht eine
Wortübereinstimmung. Frage dich: würde jemand, der hier gerade zuhört, dort
weiterlesen wollen?

Gute Bezüge:

- Dieselbe Sache aus anderer Richtung: hier die Messung, dort das Protokoll.
- Eine Voraussetzung: hier wird etwas benutzt, dort erklärt.
- Ein Widerspruch oder eine Korrektur: hier anders gesagt als dort.
- Dasselbe Fehlerbild an einem anderen Gerät.

Keine Bezüge:

- „Beide erwähnen die Elios 3." Das tun zehn Beiträge.
- Zwei Stellen, an denen dasselbe Wort fällt, ohne Zusammenhang.
- Der offensichtliche Nachbar in derselben Themenreihenfolge — den zeigt die
  Mediathek von selbst.

**Höchstens fünf Bezüge.** Lieber drei, die tragen. Eine Liste mit
fünfzehn Verweisen liest niemand, und die guten verschwinden darin.

## Dann schreiben

Nur in `medien/<slug>/beitrag.md`, im Block `bezuege`, mit `Edit`:

```markdown
<!-- bezuege:start -->
- [[messprotokoll-lesen#03:15]] Dasselbe Fehlerbild aus anderer Richtung
- [[akku-grundlagen#12:40]] Dort wird die Zellspannungsmessung erklärt
<!-- bezuege:ende -->
```

- **Die Zeit gehört zum Ziel**, nicht zu diesem Beitrag: `#03:15` ist die
  Stelle in `messprotokoll-lesen`. Sie muss der `start` eines echten
  Segments dort sein.
- Bei einem Textbeitrag als Ziel nimm den Abschnittsanker:
  `[[messprotokoll-lesen#akku-und-spannung]]`. Der Anker ist die
  kleingeschriebene Überschrift mit Bindestrichen (`ä`→`ae`, `ö`→`oe`,
  `ü`→`ue`, `ß`→`ss`).
- **Eine Zeile Begründung, in der Sache.** „Dasselbe Fehlerbild aus anderer
  Richtung" ist eine Begründung. „Verwandtes Thema" ist keine.
- **Trage den Bezug nur HIER ein.** Die Gegenrichtung berechnet die
  Mediathek; schreibst du ihn auch in die andere Datei, steht er doppelt.
- Vorhandene Bezüge bleiben stehen, wenn ihr Ziel noch existiert.

Prüfe die Slugs mit `ls medien` — ein Verweis ins Leere erzeugt in der
Oberfläche eine Warnung.

## Zum Schluss

Nenne die Bezüge, die du eingetragen hast, mit Begründung. Und nenne die,
die du **erwogen und verworfen** hast — das ist oft die nützlichere Hälfte,
weil daran zu sehen ist, wo die Bibliothek dünn ist.
