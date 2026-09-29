# Anleitungen für einen Vault

Dieser Ordner gehört zum Mediathek-Repo und bleibt dort. Obsidian öffnet den
Vault aus Notizen, Filmen und Bases. Erschließen macht das Kommando, mit dem
Vault als Arbeitsverzeichnis:

```bash
node scripts/vault.mjs --vault D:\Wissen kapitel "Vorflugkontrolle Elios 3"
node scripts/vault.mjs --vault D:\Wissen transkribieren "Vorflugkontrolle Elios 3"
node scripts/vault.mjs --vault D:\Wissen bestand "Wie prüfe ich die Zellspannung?"
```

`--was` zeigt den Auftrag und startet nichts. `--werkzeug claude` nimmt Claude
statt Grok. Die Ordnernamen des Vaults stehen in `vorlagen/toolset.yaml`.
Dieselben Namen stehen in den Anleitungen.

Das Kommando setzt `%_REGELN.md` und die jeweilige Anleitung in den Auftrag.
`inbox` arbeitet die Notiz in einem Durchgang ein und bekommt `%_sichtung.md`
davor. `sichtung` allein urteilt nur. `%_kapitel-alle.md` bekommt
`%_kapitel.md` dahinter. Ein Verweis wie `%_kapitel.md` meint diesen Abschnitt,
nicht eine Datei im Vault.

Whisper ist `tools/transcribe.py`. Die Umgebung legt `npm run setup:python` an.
Das Protokoll liegt maschinenlokal unter Mediathek (`vault-laeufe.log`), nicht
im Vault.

## Die Aufgaben

| Auftrag | Anleitung |
|---|---|
| `inbox` | `%_inbox.md` |
| `sichtung <datei>` | `%_sichtung.md` |
| `kapitel <notiz>` | `%_kapitel.md` |
| `kapitel-alle` | `%_kapitel-alle.md` |
| `bezuege <notiz>` | `%_bezuege.md` |
| `themen` | `%_themen.md` |
| `glossar` | `%_glossar.md` |
| `fragen` | `%_fragen.md` |
| `vollstaendigkeit` | `%_vollstaendigkeit.md` |
| `bestand <frage>` | `%_bestand.md` |
| `transkribieren <notiz>` | Whisper, kein Sprachmodell |
