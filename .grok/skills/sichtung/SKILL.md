---
name: sichtung
description: >
  Beurteilt Aufnahmen oder einen Ordner gegen den Obsidian-Vault Wissenstransfer.
  Nutze den Skill bei „sichten“, „Sichtung“, „liegt das schon im Wissenstransfer“,
  „liefert das Video etwas Neues“, oder wenn ein Ordner mit neuen Mitschnitten
  gegen den Bestand gehalten werden soll. Schreibt nichts in den Vault.
  Aufruf auch als /sichtung.
---

# Sichtung

Du urteilst selbst, ob neue Dateien im Vault schon vorkommen.
`scripts/vault.mjs` übergibt dasselbe Urteil an ein Sprachmodell und erwartet
die Datei schon in der Inbox. Hier bleibt die Datei, wo sie liegt, und das
Urteil fällst du. Der Vault bleibt unverändert.

Die Urteilsform steht in `vorlagen/anleitungen/%_sichtung.md`. Dieser Skill
ist der Fall, in dem jener Abschnitt der ganze Auftrag ist. Die Verweisform
steht in `vorlagen/anleitungen/%_REGELN.md` unter Verweise.

## Vault

1. Hat der Auftrag einen Vault-Pfad, nimm ihn.
2. Sonst den geöffneten Vault aus der Obsidian-Konfiguration. Unter Windows
   `%APPDATA%\obsidian\obsidian.json`, das Feld `vaults.*.path` mit
   `"open": true`. Sind mehrere offen, den Ordner, dessen Name
   `Wissenstransfer` enthält.
3. Fehlt beides, frag nach dem Pfad. Ein Vault wird hier nicht angelegt.

Die Ordnernamen stehen in der `toolset.yaml` des Vaults. Fehlt sie, gilt
`vorlagen/toolset.yaml` in diesem Repo. Gebraucht werden `inbox`,
`ordner.notizen`, `ordner.karten`, `ordner.glossar`, `ordner.anhaenge`.

## Welche Dateien

Eine Datei oder ein Ordner, nach `collectMediaFiles` in
`lib/import/collect.ts`: bis drei Ebenen, höchstens 200 Dateien,
Punkt-Ordner auslassen.

## Bestand

Lies die Titel der Notizen, die Themenkarten und die `begriff:`-Zeilen im
Glossar. Eine Notiz oder ihr Transkript öffnest du, wenn Titel oder Karte
zur neuen Datei passen.

Gleicher Dateiname in den Anhängen, den Notizen oder der Inbox: die
Aufnahme liegt schon im Vault. Dann kein neues Transkript. Das Urteil ist
`vorhanden`, der Wikilink zeigt auf die Notiz. Gibt es nur die Datei,
steht ihr Pfad im Satz.

## Text der neuen Datei

Text wird gelesen. Video und Audio transkribiert `tools/transcribe.py` mit
seinen Voreinstellungen für Modell, Gerät und Sprache. Dasselbe Python wie
`runWhisper` in `scripts/vault.mjs`: die Umgebung `tools/.venv`,
`PYTHONUTF8=1`, Arbeitsverzeichnis `tools/`, ffmpeg und ffprobe wie
`locateFfmpeg` dort. Die Fachbegriffe wie `glossaryTerms` in
`scripts/vault-lib.mjs`, kommagetrennt als `--hotwords-file`. Auf stdout
kommen JSON-Zeilen; der Text steht in `transcript.json`.

Der Arbeitsordner ist maschinenlokal, einer je Quellpfad. Der Ordnername
sind die ersten 12 Hexzeichen von SHA-256 über den absoluten Pfad.

- Windows: `%LOCALAPPDATA%\Mediathek\sichtung\<hash>`
- macOS: `~/Library/Application Support/Mediathek/sichtung/<hash>`

Liegt dort `transcript.json` und ist die Quelle nicht neuer, nimm sie.
Eine Datei nach der anderen. Fehlt die Python-Umgebung, brich ab und nenne
`npm run setup:python` im Mediathek-Repo. Fehlt ffmpeg, brich ab und nenne
`MEDIATHEK_FFMPEG_DIR` als Ordner mit ffmpeg und ffprobe.

Zwei Standbilder sind kein Transkript.

## Urteil

Je Datei der Block aus `%_sichtung.md`. Ein Wikilink nur auf einen Namen,
den es im Vault gibt. Die Einschätzung beschreibt das Thema. Einmalcodes,
Zugangsdaten und Schlüssel aus Bild oder Transkript bleiben draußen.

## Ausgabe

Zuerst die Liste: Dateiname, Länge, Urteil. Darunter je Datei der Block.
Nenne den gelesenen Vault und dass nichts hineingeschrieben wurde.
