# Dieser Vault

Dieser Ordner ist eine Mediathek aus Notizen, Filmen und Sprachmemos. Wer ihn
nur liest, braucht Obsidian und sonst nichts. Wer ihn erschließt, arbeitet
nach `anleitungen/REGELN.md` und dem Maschinenteil `toolset.yaml`.

Das Wichtigste in drei Sätzen:

1. Der Text über der ersten Werkzeug-Überschrift ist von Hand und bleibt
   unberührt. Geschrieben wird unter `## Kapitel`, `## Zusammenfassung`,
   `## Bezüge` und `## Transkript`. Dateien werden bearbeitet, nie neu
   geschrieben, außer eine Notiz entsteht aus der Inbox.
2. Nichts erfinden. Quelle ist `transcript.json` und, bei Textnotizen, der
   Text der Notiz selbst.
3. Alles, was Menschen lesen, ist deutsch.

## Dateinamen

Eine Notiz heißt wie ihr Titel: `Vorflugkontrolle Elios 3.md`. Eine Map of
Content heißt `$_Zellspannung.md`. Das Präfix `$_` ist echt. Spitze Klammern
in Anleitungen sind Platzhalter und stehen nie im Dateinamen.

## Die Aufgaben

| Anleitung | Aufgabe |
|---|---|
| `anleitungen/inbox.md` | Rohdateien in `Inbox/` beurteilen |
| `anleitungen/sichtung.md` | neu, ähnlich oder vorhanden, ohne etwas zu verschieben |
| `anleitungen/kapitel.md` | Kapitel und Zusammenfassung einer Notiz |
| `anleitungen/kapitel-alle.md` | dasselbe für alle Notizen ohne Kapitel |
| `anleitungen/bezuege.md` | verwandte Stellen finden |
| `anleitungen/themen.md` | Maps of Content mit `$_` pflegen |
| `anleitungen/glossar.md` | Begriffe sammeln |
| `anleitungen/fragen.md` | gleichartige Fragen zusammenfassen |
| `anleitungen/vollstaendigkeit.md` | Lücken mit Beleg |
| `anleitungen/bestand.md` | eine Frage beantworten und unter `Fragen/` ablegen |

Die Anleitungen nennen kein Programm. Ein CLI liest `toolset.yaml` und übergibt
einen Satz der Form: „Befolge die Anweisungen in anleitungen/kapitel.md. Es
geht um die Notiz Vorflugkontrolle Elios 3.“
