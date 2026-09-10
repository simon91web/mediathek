<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Mediathek

Lokale Mediathek für selbst aufgenommene Lehrmedien: Videos, Sprachmemos und
Textbeiträge. Läuft als Server auf 127.0.0.1, keine Cloud, kein Login. Das
Ansehen-Programm wird als portabler Ordner an Kollegen weitergegeben.

Diese Datei sagt, **was hier nicht kaputtgehen darf** — keine Feature-Liste.

## Sprache

Alles, was Menschen lesen, ist deutsch: UI-Texte, Fehlermeldungen,
Kommentare im Code, Commit-Messages. Bezeichner im Code sind englisch
(`items`, `chapters`, `references`). **Routen sind deutsch** (`/medien`,
`/kurse`, `/importieren`, `/einstellungen`), und die Dateien in der
Bibliothek ebenso (`medien/`, `beitrag.md`, `anhaenge/`, `titel:`).

## Die Bibliothek ist die Wahrheit, nicht die Datenbank

Es gibt keine Datenbank. Alles steht in Textdateien in einem
Bibliotheksordner, den der Nutzer weitergibt:

```
<Bibliothek>/
  medien/<slug>/beitrag.md          ← die einzige handgeschriebene Datei
  medien/<slug>/video.mp4|audio.m4a ← bestimmt die Art; fehlt sie, ist es Text
  medien/<slug>/transcript.json|.vtt, poster.jpg   ← generiert
  medien/<slug>/anhaenge/**         ← PDFs, Infografiken, Präsentationen
  kurse/<slug>.md                   ← geordnete Verweise
  library.json                      ← GENERIERTER Index, jederzeit löschbar
```

Daraus folgen Regeln, die nicht verhandelbar sind:

- **`library.json` ist ein Cache.** Nie als Wahrheit behandeln, nie von Hand
  pflegen. Wird der Parser geändert, verfällt er automatisch über die
  App-Version (`MEDIATHEK_APP_VERSION`, in `next.config.ts` eingebacken).
- **Ein Beitrag bleibt benutzbar, auch wenn seine Datei kaputt ist.** Kaputtes
  YAML, fehlende `beitrag.md`, Kapitel hinter dem Medienende: alles wird zu
  einem Hinweis in `Item.problems`, nie zu einer Fehlerseite. Dafür gibt es
  einen E2E-Test.
- **Zuschauer schreiben nie in die Bibliothek.** Der Ordner liegt womöglich
  schreibgeschützt auf einem Netzlaufwerk und wird von mehreren gelesen. Die
  Wiedergabeposition liegt im `localStorage` (`lib/watch-progress.ts`).
- **Maschinenlokales gehört nach `%LOCALAPPDATA%\Mediathek`** — Programmpfade,
  Autorenmodus, Job-Zustände. Laufwerksbuchstaben von Kollege A gelten nicht
  für Kollege B.

## Der Vertrag mit Claude Code

Kapitel, Zusammenfassungen und Bezüge trägt Claude Code extern in
`beitrag.md` ein. Das ist nur vertretbar, weil drei Dinge gelten:

1. **Marker-Blöcke sind das Schreibfenster.** Alles außerhalb von
   `<!-- kapitel:start -->` … `<!-- kapitel:ende -->` bleibt unberührt.
   Siehe `lib/library/sections.ts`.
2. **Kapitel sind Zeilen im Text**, nicht ein zweiter Datenbestand:
   `01:24 Akku prüfen`. Von Hand getippt, per Editor-Knopf eingefügt oder von
   Claude Code geschrieben ergibt dasselbe Format. Die Regeln stehen
   normativ in `lib/library/chapters.ts` und sind dort tabellengetrieben
   getestet — **dieser Test ist der wichtigste des Projekts.**
3. **Der Editor überschreibt keine fremde Änderung.** Er schickt die
   erwartete `mtime` mit; weicht sie ab, wird nicht gespeichert, sondern der
   Konflikt gezeigt (`lib/library/write.ts`, `e2e/editor.spec.ts`).

**Rückverweise werden berechnet, nicht geschrieben** (`lib/library/scan.ts`).
Ein Bezug wird an einer Stelle notiert und erscheint auf beiden Beiträgen;
Claude Code muss keine Beziehung doppelt pflegen.

## Was beim Anfassen leicht kaputtgeht

- **Range-Antworten.** `bytes=0-` MUSS 206 liefern, nicht 200 — sonst bricht
  das Springen in Chrome. Die Suffix-Range `bytes=-500` muss funktionieren
  (so sucht Safari das `moov`-Atom). Reine Logik in `lib/http/range.ts`,
  Tabelle in `range.test.ts`, dazu `e2e/range.spec.ts`.
- **`highWaterMark: 1 << 20`** in `lib/http/serve-file.ts`. Über SMB ist das
  der größte Einzelgewinn; mit den Standard-64 KiB bleibt der Durchsatz weit
  unter Leitungsgeschwindigkeit.
- **Die Route baut niemals einen Pfad aus Nutzereingabe.** Sie schlägt den
  Slug im Index nach und nimmt den dort gespeicherten absoluten Pfad. Ein
  Ausbruch aus der Bibliothek ist damit strukturell unmöglich — bitte keine
  Abkürzung einbauen.
- **`yaml` v2, nie `gray-matter`/`js-yaml`.** YAML 1.1 liest
  `dauer: 00:42:15` als Sexagesimalzahl 2535 und `aufgenommen: 2026-04-17`
  als zeitzonenbehaftetes `Date`. Beides ist stiller Datenverlust.
- **Der Player-Store ist die Trennlinie.** `components/player/media-view.tsx`
  ist die **einzige** Datei, die `@vidstack/react` importiert. Alles andere
  spricht über `components/player/player-store.ts`.
- **Kapitel gehen als `content` an den Track, nicht als Blob-Adresse.** Eine
  Blob-URL müsste freigegeben werden, und im Strict Mode laufen Effekte
  doppelt — die Adresse wäre danach ungültig und die Zeitleiste ohne Kapitel,
  mit einem `ERR_FILE_NOT_FOUND`, das nach einem Netzwerkfehler aussieht.
- **Kein `setState` in einem Effect, um `localStorage` zu lesen.** Der Lint
  verbietet es zu Recht; das Werkzeug ist `useSyncExternalStore` mit einem
  Server-Snapshot (siehe `watch-progress-bar.tsx`). Der Selektor muss einen
  **vergleichbaren** Wert liefern — ein neu gebautes Objekt ergibt eine
  Endlosschleife.
- **Reservierte Slugs.** Statische Routen unter `/medien/` würden einen
  Beitrag unerreichbar machen. Deshalb liegen `/anlegen` und `/importieren`
  auf oberster Ebene, und `RESERVED_NAMES` in `lib/library/slug.ts` sperrt
  die Namen zusätzlich.
- **`slugify` ersetzt deutsche Umlaute VOR der NFD-Zerlegung.** Andernfalls
  wird aus „ü" ein „u", und „Überflug" hieße `uberflug` statt `ueberflug`.

## Der Verzeichnis-Beobachter

Die zentrale Zusage — „Claude Code trägt ein, die App zeigt es" — hängt an
`fs.watch`, und das ist auf Netzlaufwerken unzuverlässig: es kann
fehlschlagen **oder erfolgreich sein und Ereignisse still verschlucken**.
Deshalb (`lib/library/watch.ts`):

1. `fs.watch` rekursiv, 2. flache Watches als Rückfall, 3. **immer** ein
Poller, der zugleich prüft, ob der Beobachter lügt. Findet der Poller etwas,
das nicht gemeldet wurde, wird auf `mode: "poll"` heruntergestuft und das
unter `/einstellungen` angezeigt.

Wichtig dabei: eigene Schreibvorgänge (Editor, Import) sind in
`store.ownWrites` vermerkt und dürfen den Modus **nicht** herabstufen — sonst
stünde nach jedem Speichern „Änderungen werden nicht gemeldet".

## Prüfen

```bash
npm run typecheck && npm run lint && npm test && npm run e2e
```

`npm run doktor` liest die Bibliothek und meldet alle Hinweise auf der
Konsole — beim Einpflegen echter Beiträge das nützlichste Werkzeug.
`npm run fixtures` legt die Entwicklungsbibliothek neu an (braucht ffmpeg für
die winzigen Mediendateien; ohne ffmpeg entstehen nur die Textbeiträge).

Die E2E-Tests laufen gegen eine **Kopie** der Fixture-Bibliothek unter
`e2e/.tmp-bibliothek`. Vorbereitet wird sie von `e2e/prepare.ts` **vor**
Playwright — nicht über `globalSetup`, denn Playwright startet den Webserver
zuerst, und der hätte dann die alte Bibliothek gelesen.

Zu wissen beim Suchen von Fehlern im Browser: vidstack startet bei
`load="eager"` über `requestAnimationFrame`. In einem Tab im Hintergrund
läuft das nicht, der Player bleibt leer — das sieht wie ein Defekt aus, ist
aber gewollt.

Nur ein `next dev` je Verzeichnis: läuft schon einer auf Port 3200, scheitert
der Testlauf mit „Another next dev server is already running".

**Für Etappe 4 vorgemerkt:** `outputFileTracingExcludes` wirkt unter Turbopack
(Stand Next 16.3) nicht — der standalone-Build enthält `bibliothek-dev` samt
Mediendateien, obwohl die Angabe in `next.config.ts` korrekt gesetzt ist. Das
Paketskript muss deshalb selbst filtern und danach prüfen, dass keine
Mediendatei, kein `tools/` und keine `.env` im Paket liegt.

## Umgebungsvariablen

| Variable | Wirkung |
|---|---|
| `MEDIATHEK_LIBRARY_DIR` | Bibliotheksordner. Ohne sie `./bibliothek-dev`. Auf Netzlaufwerken besser UNC-Pfade — gemappte Buchstaben sind an die Windows-Sitzung gebunden. |
| `MEDIATHEK_READONLY=1` | Harter Riegel für das weitergegebene Viewer-Paket: der Autorenmodus lässt sich dann nicht einschalten. |
| `MEDIATHEK_FFMPEG_DIR` | Verzeichnis mit `ffmpeg.exe` UND `ffprobe.exe`. Immer das **Verzeichnis** — der übliche Windows-Build ist ein shared build mit sieben DLLs daneben. |
| `MEDIATHEK_POLL_MS` | Poll-Abstand des Beobachters, Standard 30 s. |
| `HOSTNAME=127.0.0.1` | Für den Produktionsstart Pflicht: **ohne sie bindet Next standalone auf `0.0.0.0`** und die Mediathek wäre im Firmennetz offen. |

## Stand

Etappe 1 ist umgesetzt: Bibliothek, drei Medienarten, Player mit Kapiteln,
Textansicht mit Ankern, Anhänge, Editor, Import, Autorenmodus.

Noch offen (siehe Plan): Transkription per Whisper und Volltextsuche
(Etappe 2), Claude-Code-Brücke und Wissensnetz aus Themenseiten und
Sammlungen (Etappe 3), portables Viewer-Paket (Etappe 4).
