# Diese Bibliothek

Dieser Ordner ist eine **Mediathek**: eine Sammlung selbst aufgenommener
Lehrmedien. Wer hier arbeitet, erschließt sie — Kapitel setzen,
zusammenfassen, Bezüge finden, Themenseiten pflegen, den Fragenbestand
ordnen.

Die verbindlichen Regeln stehen in **`anleitungen/REGELN.md`**. Sie sind vor
jeder Änderung zu lesen; das Wichtigste in drei Sätzen:

1. Geschrieben wird **nur zwischen den Marker-Blöcken**
   (`<!-- kapitel:start -->` … `<!-- kapitel:ende -->`). Alles außerhalb ist
   handgeschrieben und bleibt unberührt. Dateien werden **bearbeitet**, nie
   neu geschrieben.
2. **Nichts erfinden.** Die einzigen Quellen sind `transcript.json` und der
   Text der `beitrag.md` selbst.
3. Alles, was Menschen lesen, ist **deutsch**.

## Die Aufgaben

Jede Aufgabe hat eine eigene Anleitung. Wer eine davon ausführen soll,
bekommt sie genannt und liest sie zuerst vollständig:

| Anleitung | Aufgabe |
|---|---|
| `anleitungen/kapitel.md` | Kapitel und Zusammenfassungen für einen Beitrag |
| `anleitungen/kapitel-alle.md` | dasselbe für alle Beiträge ohne Kapitel |
| `anleitungen/bezuege.md` | verwandte Stellen in anderen Beiträgen finden |
| `anleitungen/themen.md` | Themenseiten mit Synonymen und Fundstellen |
| `anleitungen/glossar.md` | Fachbegriffe in `glossar.txt` sammeln |
| `anleitungen/fragen.md` | gleichartige Fragen in `fragen/` zusammenfassen |

## Werkzeugunabhängig

Diese Anleitungen setzen **kein bestimmtes Programm** voraus. Sie beschreiben
Dateien und deren Format — mehr braucht es nicht. Die Mediathek ruft ein
Kommandozeilenwerkzeug nach Wahl auf und übergibt ihm einen Satz der Form:

> Befolge die Anweisungen in `anleitungen/kapitel.md`. Es geht um den Beitrag
> „akku-pruefen".

Für Claude Code liegen in `.claude/commands/` zusätzlich kurze Abkürzungen
(`/kapitel`, `/bezuege`, …). Sie verweisen auf dieselben Anleitungen und sind
reine Bequemlichkeit — die Wahrheit steht in `anleitungen/`.
