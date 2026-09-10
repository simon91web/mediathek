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
`/themen`, `/importieren`, `/einstellungen`), und die Dateien in der
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
  themen/<slug>.md                  ← Wissensgebiete: Synonyme + Fundstellen
  sammlungen/<slug>.md              ← geordnete Wege durch Ausschnitte
  glossar.txt                       ← Fachbegriffe; speist Whispers hotwords
  .claude/                          ← die Bibliothek IST ein Claude-Code-Projekt
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

## Woher der Bibliotheksordner kommt

Drei Quellen, in dieser Reihenfolge (`lib/paths.ts`):

1. **`MEDIATHEK_LIBRARY_DIR`** — setzt der Launcher des Viewer-Pakets. Ist
   sie gesetzt, gewinnt sie, und die Oberfläche kann den Ordner NICHT
   umstellen (`LIBRARY_DIR_FIXED`). Genau das soll sie leisten.
2. **Der unter Einstellungen gewählte Ordner**, maschinenlokal in
   `settings.json` als `lastLibraryDir`. Übernommen in `instrumentation.ts`
   per `applyStoredLibraryDir()` — **vor** dem ersten Scan, sonst liest der
   die Entwicklungsbibliothek und der Beobachter bewacht den falschen Ordner.
3. **`./bibliothek-dev`** in der Entwicklung.

Daran hängen drei Festlegungen:

- **`paths` sind Getter, keine Konstanten.** Der Ordner kann sich zur Laufzeit
  ändern; die fünfzehn Dateien, die `paths.items` benutzen, sehen den Wechsel
  dadurch von selbst. Der Ordner selbst liegt auf `globalThis` — ein Modul-`let`
  würde in `instrumentation.ts` gesetzt und in den Route Handlern nicht
  gesehen (andere Modulinstanz unter Turbopack).
- **`lib/paths.ts` darf nichts aus `node:fs` anfassen.** Die Datei landet über
  `lib/library/urls.ts` im Client-Bundle. Deshalb hält sie den Pfad nur; die
  Einstellung liest `lib/library/library-dir.ts` (server-only).
- **Ein Wechsel ist mehr als ein Pfad.** `switchLibrary` in
  `lib/library/switch.ts` wartet einen laufenden Scan ab, schließt den
  Beobachter, leert Index, Cache und `ownWrites`, wirft Suchindex,
  Transkript-Zwischenspeicher und Auftragsschlange weg (die merkt sich ihren
  Zustandsordner bei der Erzeugung!) und hängt den Beobachter neu an. Bleibt
  eines davon stehen, zeigt die Mediathek eine Mischung aus zwei Beständen.
  `store.generation` wird dabei NICHT zurückgesetzt — der Client pollt darauf
  und erkennt eine Änderung nur an einer höheren Zahl.

Ein laufender Auftrag verhindert den Wechsel: er schreibt sein Ergebnis über
absolute Pfade in die alte Bibliothek. Und ein Ordner wird nie angelegt —
ein Tippfehler soll kein verwaistes Verzeichnis hinterlassen, ein nicht
verbundenes Netzlaufwerk als solches gemeldet werden (`checkLibraryDir`,
`lib/library/library-dir.test.ts`).

`scripts/fixtures.ts` nagelt den Ordner ausdrücklich auf `bibliothek-dev`
fest: es ERZEUGT diese Bibliothek, und ohne das schriebe es den
Claude-Code-Vertrag in die echte.

## „Themen", nicht „Kurse"

Ein **Thema** ist der Einstieg in ein Wissensgebiet — eine Datei
`themen/<slug>.md`, deren Wikilinks in ihrer Reihenfolge die Reihenfolge des
Themas sind. Bewusst **kein** Kurs: die Mediathek ist auch Simons eigene
Wissensdatenbank, nicht nur Einarbeitungsmaterial, und niemand muss etwas
„durcharbeiten".

Deshalb gibt es **keinen zweiten Ordner** für Wissensgebiete. Eine
Themendatei trägt zwei Ebenen, und der Schnitt zwischen ihnen ist der
Marker-Block:

- **Außerhalb** der Marker stehen ganze Beiträge in der Reihenfolge, in der
  man sie ansehen würde — handgeschrieben.
- **Im** Block `fundstellen` stehen einzelne Stellen (`[[slug#12:40]]`,
  `[[slug#anker]]`) quer durch alles — das Schreibfenster für Claude Code.

Wird das verwechselt, zählt eine Fundstelle als ganzer Beitrag und die
Themenseite behauptet eine Reihenfolge, die niemand so gemeint hat. Dafür
gibt es `lib/library/topics.test.ts`.

Die **Synonyme** im Kopf (`synonyme: [Balancing, Zellprüfer]`) sind kein
Beiwerk: sie erweitern die Suchanfrage und sind der einzige Weg dieser
Mediathek zu bedeutungsnaher Suche. Anders als Schlagworte werden sie NICHT
zu Slugs normalisiert — sie werden angezeigt.

**Sammlungen** (`sammlungen/<slug>.md`) sind die andere Hälfte: ein
geordneter Weg durch Ausschnitte, abspielbar über Beitragsgrenzen hinweg.
Steht `suche:` im Kopf, wird daraus eine gespeicherte Suche, die bei jedem
Aufruf neu läuft. Der Unterschied ist gewollt: eine feste Liste ist eine
Aussage, eine gespeicherte Suche eine Frage. Sammlungen haben bewusst
**keinen** Marker-Block — sie sind eine Entscheidung ihres Autors, nichts,
was ein Sprachmodell umsortieren soll.

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
Claude Code muss keine Beziehung doppelt pflegen. Dasselbe gilt für „Themen
in diesem Beitrag": das kommt aus den Fundstellen der Themenseiten
(`topicSpotsByItem`), nicht aus einer zweiten Liste in `beitrag.md`.

**Der Vertrag selbst liegt IN der Bibliothek**, nicht im Programm:
`.claude/CLAUDE.md` und `.claude/commands/*.md`. Er wandert mit dem Ordner —
liegt er auf dem Netzlaufwerk, gelten beim Kollegen dieselben Regeln. Die
Vorlagen dafür stehen unter `vorlagen/bibliothek-claude/`; kopiert werden sie
von `lib/claude/install.ts`, das **vorhandene Dateien nie überschreibt**
(eine angepasste Regel ist der Teil, den man anpasst).

## Der Knopf, der einen Prozess startet

`lib/claude/launch.ts` + `scripts/kapitel-starten.ps1` — die gefährlichste
Stelle der Anwendung, und ein bewusst **löschbares Paar**: wer beides
entfernt, verliert einen Knopf. Der eigentliche Weg bleibt der Handbetrieb
(`cd S:\Mediathek`, `claude`, `/kapitel akku-pruefen`), und er steht auch so
in der Oberfläche.

Vier Riegel, jeder für sich ausreichend:

1. **Autorenmodus** (`assertAuthorMode`). Im Viewer-Paket nicht einschaltbar.
2. **Server Action**, kein Route Handler: Next prüft dabei Origin gegen Host.
3. **Positivlisten.** Befehl gegen `CLAUDE_COMMANDS`, Slug gegen
   `SLUG_PATTERN`, gegen den Index UND gegen das Dateisystem
   (`medien/<slug>/beitrag.md` muss existieren). Im PS-Skript zusätzlich
   `ValidateSet` und `ValidatePattern` — erst deshalb ist es vertretbar, für
   den `claude`-Aufruf eine Kommandozeile zu bauen: dort kann kein
   Anführungszeichen und kein Semikolon stehen. Nie `shell: true`.
4. **Zehn Sekunden Sperre** zwischen zwei Starts, jeder Start ins
   maschinenlokale `claude-starts.log`.

Dazu `proxy.ts` mit einer Host-Positivliste gegen DNS-Rebinding (die
Datei hieß bis Next 16.2 `middleware.ts`; `next build` weist auf die
Umbenennung hin): die
Bindung auf 127.0.0.1 allein genügt nicht, weil eine fremde Seite einen
eigenen Namen auf 127.0.0.1 auflösen lassen kann. Geprüft wird der **Name**,
nicht die Adresse.

Das Fenster ist **absichtlich sichtbar** (`Start-Process` mit `-NoExit`):
man muss mitlesen, was in die eigenen Dateien geschrieben wird. Der
Node-Aufruf selbst läuft mit `windowsHide`, sonst blitzte eine leere Konsole
auf. Vorführen lässt sich das Skript gefahrlos mit `-WhatIf`.

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
- **Der Ausschnitt-Stopp läuft UNGEDROSSELT.** `publish` meldet die Zeit alle
  250 ms an den Store, `checkStop` wird dagegen bei jedem `timeupdate`
  gerufen (`components/player/media-view.tsx`). Mit der Drosselung liefe ein
  Ausschnitt bis zu eine Viertelsekunde über sein Ende hinaus, und genau das
  hört man. `setStopAt` benachrichtigt dafür NICHT — es ist eine Einstellung,
  kein Zustand; sonst löste der Effect, der es setzt, ein Neurendern aus, das
  ihn wieder aufruft.
- **Kein `setState` in einem Effect, um `localStorage` zu lesen.** Der Lint
  verbietet es zu Recht; das Werkzeug ist `useSyncExternalStore` mit einem
  Server-Snapshot (siehe `watch-progress-bar.tsx`). Der Selektor muss einen
  **vergleichbaren** Wert liefern — ein neu gebautes Objekt ergibt eine
  Endlosschleife.
- **Reservierte Slugs.** Statische Routen unter `/medien/` würden einen
  Beitrag unerreichbar machen. Deshalb liegen `/anlegen` und `/importieren`
  auf oberster Ebene, und `RESERVED_NAMES` in `lib/library/slug.ts` sperrt
  die Namen zusätzlich.
- **Zeilennummern in Hinweisen zählen in der DATEI, nicht im Body.** Die
  Teil-Parser (`chapters.ts`, `sections.ts`, `wikilink.ts`) bekommen den Text
  nach dem Frontmatter-Zaun und zählen darin ab 1 — richtig so, ihre
  tabellengetriebenen Tests hängen daran. Verschoben wird **einmal am Ende**
  in `beitrag-md.ts`, `topics.ts` und `collections.ts` (`lineOffset`,
  `shiftProblems`, `shiftSourceLines` in `frontmatter.ts`). Wer eine neue
  Quelle von Hinweisen anschließt, muss sie in den richtigen der beiden Töpfe
  legen: die Hinweise aus `splitFrontmatter`/`parseItemFrontmatter` zählen
  schon in der Datei und dürfen NICHT mitverschoben werden. Festgenagelt in
  `lib/library/beitrag-md.test.ts`.
- **`slugify` ersetzt deutsche Umlaute VOR der NFD-Zerlegung.** Andernfalls
  wird aus „ü" ein „u", und „Überflug" hieße `uberflug` statt `ueberflug`.

## Transkription

Die Kette ist: Knopf → Server Action → Auftragsschlange → `tools/transcribe.py`
→ JSON-Lines auf stdout → Fortschritt per Ereignisstrom → `transcript.json`.

Nachgemessen auf dieser Maschine, und deshalb so gebaut:

- **ctranslate2 4.8.1 braucht kein cuDNN.** Aus `ctranslate2.dll` extrahiert:
  nur `nvcuda.dll` und `cublas64_12.dll` werden zur Laufzeit referenziert.
  `tools/requirements.txt` installiert deshalb allein `nvidia-cublas-cu12` —
  `nvidia-cudnn-cu12` wären 700 MB für nichts.
- **cuBLAS muss VOR den Suchpfad**, nicht über `os.add_dll_directory()`. Das
  wirkt für ctranslate2 nachweislich nicht (es lädt per einfachem
  `LoadLibrary`), und es ist der Rat, den man überall liest. Gesetzt wird der
  Pfad in `lib/jobs/python.ts`; `transcribe.py` heilt sich zusätzlich selbst,
  damit ein Aufruf von Hand aus dem Terminal auch geht.
- **`PYTHONUTF8=1` ist Pflicht.** Python 3.14 nutzt beim Pipe cp1252; der
  erste Umlaut in einer Meldung würde den Lauf mitten in einem
  90-Minuten-Video töten.
- **Fachbegriffe gehen als `hotwords`, nicht als `initial_prompt`.**
  Nachgemessen an derselben Aufnahme: ohne alles 11 Segmente (2,8 s Schnitt)
  und „Eliös 3"; mit `initial_prompt` 5 Segmente (längstes 18 s) und „Elios
  3"; mit `hotwords` 7 Segmente (längstes 10,3 s) und „Elios 3". Der
  Anfangs-Prompt wirkt als Kontext und lässt das Modell viel längere Blöcke
  bilden — bei „Klick auf die Transkriptzeile springt zur Stelle" landet man
  dann bis zu achtzehn Sekunden daneben.
- **`condition_on_previous_text=False`.** Sonst hält sich das Modell an einer
  Fehltranskription fest und vergiftet den Rest eines langen Laufs.
- **Der Probelauf muss ein echtes Encode fahren.** `WhisperModel(…,
  device="cuda")` meldet Erfolg auch ohne cuBLAS; der Fehler kommt erst beim
  ersten `encode()`. Eine Prüfung, die nur das Modell lädt, ist wertlos.
- **`float16` gibt es auf CPU nicht.** Ein Rückfall muss Modell UND Rechenart
  umschreiben, sonst läuft man in einen stillen Ersatz.
- **`taskkill /PID … /T`** beim Abbrechen: ohne `/T` überlebt das von Python
  gestartete `ffmpeg.exe`. Zusätzlich hängt `tools/procutil.py` die Kinder an
  ein Win32-Job-Objekt, das beim Sterben des Elternteils aufräumt.
- **Nach einem Serverabsturz wird keine gespeicherte Prozesskennung getötet** —
  sie kann inzwischen einem unbeteiligten Programm gehören. Der Auftrag wird
  auf „fehler" gesetzt, mit Knopf zum Wiederholen.

## Suche

Drei Kanäle in `lib/search/index.ts`, und das ist keine Umständlichkeit:

1. **MiniSearch** für Rangfolge und Präfixe. Findet „vorflug" in
   „Vorflugkontrolle", aber **nicht** „kontrolle" — MiniSearch kennt keine
   Wortmitte, und bei deutschen Komposita ist genau das der wichtige Fall.
2. **Ein wörtlicher Teilstring-Durchgang** über dieselben Blöcke. Schließt die
   Lücke und ist bei Anfragen in Anführungszeichen der einzige zuständige
   Kanal.
3. **Die Synonyme der Themenseiten** (`lib/search/synonyms.ts`). Wer
   „Balancing" sucht, findet die Stelle, an der „Zellspannung" gesagt wurde
   — bedeutungsnahe Suche ohne Embeddings und ohne eine Zusatzabhängigkeit
   beim Kollegen.

Zum dritten Kanal drei Festlegungen, die nicht verhandelbar sind:

- **Ein erweiterter Treffer wird als solcher gekennzeichnet** („gefunden über
  ‚Zellprüfer' aus dem Thema …"), und die Trefferliste sagt, wonach
  zusätzlich gesucht wurde. Eine stille Erweiterung wäre schlimmer als
  keine: man hielte den Fremdtreffer für einen eigenen und wüsste nicht,
  warum das gesuchte Wort im Auszug fehlt.
- **Direkte Treffer stehen immer über erweiterten**, und zwar durch die
  Reihenfolge der Liste, nicht durch die Punktzahl. Ein MiniSearch-Wert kann
  klein sein; auf die Zahlen zu hoffen wäre falsch.
- **Verglichen wird über ganze Token**, nicht über Teilstrings. Im zweiten
  Kanal ist die Wortmitte gewollt, hier wäre sie fatal: „Ah" in „fahren"
  würde eine Gruppe aufziehen und die Liste mit Fremdmaterial fluten.

Weitere Festlegungen:

- **Indiziert werden Blöcke, nicht Segmente** (~40 Wörter, an Kapitelgrenzen
  geschnitten). Faktor zehn weniger Dokumente; die genaue Sekunde wird
  nachträglich aus den Segmenten bestimmt (`refineStart`) — ohne diesen
  Schritt landet man bis zu dreißig Sekunden zu früh.
- **`storeFields` enthält nicht den Text.** Snippets kommen beim Anzeigen aus
  der Blockliste. Ohne diese Sparsamkeit landet der Index bei fünfhundert
  Beiträgen im Gigabyte-Bereich.
- **Snippets sind Offsets, kein HTML.** Bibliotheksinhalte sind Fremdtext;
  `dangerouslySetInnerHTML` verbietet sich dafür.
- **`MEDIATHEK_SUCHE_MAX_MB`** (400) ist die Notbremse: reißt die Grenze,
  bricht der Aufbau ab und es wird nur noch wörtlich gesucht — langsamer,
  aber vollständig, und nie ein überlaufender Speicher.
- **Der Auszug aus Anhängen liegt in `anhaenge/.text/`** und geht bewusst
  NICHT in den Fingerprint ein (das kostete ein zusätzliches `readdir` je
  Beitrag). Deshalb ruft `lib/jobs/extract-job.ts` `reloadLibrary` mit
  `force: true` — ohne das bliebe `hasText` falsch und der Text für die Suche
  unsichtbar.

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

**Der Claude-Code-Start wird NICHT im Testlauf geprüft** — er öffnet ein
Fenster auf der Maschine, in dem ein Sprachmodell in die Bibliothek schreibt.
`e2e/claude.spec.ts` prüft alles davor: die Riegel, die Beschriftungen und
die Host-Abweisung. Das PS-Skript selbst lässt sich gefahrlos vorführen:

```powershell
.\scripts\kapitel-starten.ps1 -LibraryDir S:\Mediathek -Command kapitel -Slug akku-grundlagen -WhatIf
```

**Für Etappe 4 vorgemerkt:** `outputFileTracingExcludes` wirkt unter Turbopack
(Stand Next 16.3) nicht — der standalone-Build enthält `bibliothek-dev` samt
Mediendateien, obwohl die Angabe in `next.config.ts` korrekt gesetzt ist. Das
Paketskript muss deshalb selbst filtern und danach prüfen, dass keine
Mediendatei, kein `tools/` und keine `.env` im Paket liegt.

## Umgebungsvariablen

| Variable | Wirkung |
|---|---|
| `MEDIATHEK_LIBRARY_DIR` | Bibliotheksordner, und zwar **fest**: ist sie gesetzt, lässt sich der Ordner in der Oberfläche nicht umstellen. Ohne sie gilt der unter Einstellungen gewählte, sonst `./bibliothek-dev`. Auf Netzlaufwerken besser UNC-Pfade — gemappte Buchstaben sind an die Windows-Sitzung gebunden. |
| `MEDIATHEK_READONLY=1` | Harter Riegel für das weitergegebene Viewer-Paket: der Autorenmodus lässt sich dann nicht einschalten. |
| `MEDIATHEK_FFMPEG_DIR` | Verzeichnis mit `ffmpeg.exe` UND `ffprobe.exe`. Immer das **Verzeichnis** — der übliche Windows-Build ist ein shared build mit sieben DLLs daneben. |
| `MEDIATHEK_POLL_MS` | Poll-Abstand des Beobachters, Standard 30 s. |
| `MEDIATHEK_HOSTS` | Zusätzlich erlaubte Host-Namen (Komma-getrennt). Ohne sie antwortet die Mediathek nur auf `127.0.0.1` und `localhost` — siehe `proxy.ts`. |
| `HOSTNAME=127.0.0.1` | Für den Produktionsstart Pflicht: **ohne sie bindet Next standalone auf `0.0.0.0`** und die Mediathek wäre im Firmennetz offen. |

## Einrichten

```bash
npm install
npm run fixtures        # Entwicklungsbibliothek (braucht ffmpeg)
npm run setup:python    # nur für Transkription; --cpu ohne NVIDIA-Karte
npm run dev
```

`npm run setup:python` endet mit einem Probelauf und sagt auf Deutsch, ob die
Grafikkarte nutzbar ist. Auf dieser Maschine: RTX 4070, float16,
`large-v3-turbo` — rund fünfundzwanzigmal schneller als Echtzeit.

## Stand

**Etappe 1:** Bibliothek, drei Medienarten, Player mit Kapiteln, Textansicht
mit Ankern, Anhänge, Editor, Import, Autorenmodus.

**Etappe 2:** Transkription per Whisper (GPU mit CPU-Rückfall),
Auftragsschlange mit Ereignisstrom, Kachelbilder (Video: Einzelbild mit
Schwarzbild-Prüfung, Audio: Wellenform), Textauszug aus PDF-Anhängen,
Volltextsuche über alles.

**Etappe 3:** Themen mit Synonymen und Fundstellen, Sammlungen als
abspielbare Ausschnittsfolge und als gespeicherte Suche, Synonym-Erweiterung
der Suche, Claude-Code-Brücke mit dem Vertrag in der Bibliothek,
Host-Positivliste.

Noch offen (siehe Plan): portables Viewer-Paket (Etappe 4). Dabei zu
beachten: `scripts/kapitel-starten.ps1` und `vorlagen/bibliothek-claude/`
müssen ins Paket, sonst fehlt dem Autorenmodus beim Kollegen die halbe
Brücke.
