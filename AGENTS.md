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
  fragen/<slug>.md                  ← beantwortete Fragen mit Belegen
  glossar.txt                       ← Fachbegriffe; speist Whispers hotwords
  anleitungen/                      ← die Regeln, nach denen ein KI-Werkzeug schreibt
  AGENTS.md                         ← Einstieg dorthin, für jedes Werkzeug
  .claude/                          ← Abkürzungen (/kapitel …) nur für Claude Code
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
Aussage, eine gespeicherte Suche eine Frage.

Sammlungen haben als einzige Dateiart **keinen** Marker-Block, und es gibt
für sie **keine Anleitung** in `anleitungen/`: sie sind die Entscheidung
ihres Autors, nichts, was ein Sprachmodell erfinden oder umsortieren soll.
Angelegt werden sie deshalb in der Oberfläche — Knopf auf `/sammlungen`,
oder „Diese Suche merken" auf der Suchseite (`lib/library/write-collection.ts`).

Zwei Fallstricke dabei, beide in `lib/library/collections.test.ts`
festgenagelt:

- **HTML-Kommentare zählen nicht als Ausschnitt.** Eine frisch angelegte
  Folge bekommt ein auskommentiertes Beispiel mit `[[…]]` in die Datei; ohne
  das Ausblenden (`blankComments`) läse der Parser es als echten Eintrag auf
  einen erfundenen Beitrag. Ausgeblendet wird mit Leerzeichen, damit die
  Zeilennummern gültig bleiben.
- **Eine frisch angelegte Folge ist leer und wird als leer gemeldet.** Das
  ist die Erinnerung, dass die Ausschnitte noch fehlen — deshalb hat
  `createCollection` ein ausdrückliches `allowEmpty` statt einer
  stillschweigenden Ausnahme.

## Fragen — das FAQ, das anfällt

Eine Datei je Frage in `fragen/`, mit ihrer Antwort im Marker-Block
`antwort`. Sie entstehen nicht durch eine Entscheidung, sondern durch
Benutzung: **jede im Chat beantwortete Frage wird abgelegt**, ohne Nachfrage.

Das ist die eine Festlegung, an der alles hängt, und sie ist bewusst so:

- Eine Rückfrage „aufheben?" würde neunmal weggeklickt, und das zehnte Mal
  wäre das wichtige. Wer beim Fragen überlegen muss, ob die Frage gut genug
  ist, fragt nicht.
- Der Preis ist Halbgares in `fragen/`. Deshalb MUSS das Wegräumen leicht
  bleiben (Knopf auf der Frageseite, `deleteQuestion` — das einzige Löschen
  in dieser Anwendung), und deshalb gibt es die Aufgabe „Fragen
  zusammenfassen" (`anleitungen/fragen.md`): sie macht aus dem Haufen einen
  Bestand, indem gleichartige Fragen zu einem Eintrag werden und die anderen
  Formulierungen unter `auch gefragt:` wandern.
- `auch gefragt:` ist das Gegenstück zu den Synonymen einer Themenseite:
  **zusammenlegen darf nichts kosten.** Wer die zweite Formulierung sucht,
  findet sie dort wieder. Deshalb wird das Feld auch NICHT am Komma getrennt
  — dort stehen ganze Sätze (`toQuestionList` in `frontmatter.ts`).

**Belege sind Wikilinks im Fließtext**, nicht eine Liste darunter:
`[[cloud-compare-1#04:25]]` mitten im Satz. Das ist der Unterschied zwischen
einer Antwort und einer Hausaufgabe — ein Klick öffnet den Beitrag an der
belegten Sekunde. Gerendert wird aus Stücken, nie als HTML
(`lib/library/answer-text.ts`, `components/fragen/antwort-text.tsx`): der Text
kommt von einem Sprachmodell und ist Fremdtext, wie die Suchauszüge auch. Ein
Beleg auf einen Beitrag, den es nicht gibt, wird ausdrücklich NICHT verlinkt.

Die Systemanweisung des Chats verlangt genau dieses Format. Ändert sich die
Verweisform, müssen `lib/assistant/chat.ts` und `anleitungen/fragen.md`
mitgehen — sonst schreibt das Werkzeug Belege, die niemand anklicken kann.

### Das Internet als zweite Quelle

Aus ist der Normalfall. Freigegeben wird zweimal: in den Einstellungen
(`chatWebAllowed`) und an der einzelnen Frage (Schalter „Internet
mitlesen"). Fehlt eines von beidem, bleibt der Chat im eigenen Bestand — und
die Systemanweisung erwähnt das Netz dann gar nicht erst.

Wie ein Werkzeug überhaupt ins Netz darf, ist Werkzeugsache und steht
deshalb in den Einstellungen (`chatWebArgs`, Standard
`--allowedTools WebSearch` für claude).

**Die Herkunft wird getrennt.** Was aus dem Netz stammt, beginnt mit „Aus dem
Netz:" und trägt seine Adresse; was aus der Bibliothek stammt, trägt seinen
Wikilink. Dieselbe Festlegung wie bei der über Synonyme erweiterten Suche:
eine stille Vermischung wäre schlimmer als keine Erweiterung, weil man den
Fremdtreffer für eigenes Material hielte.

## Der Vertrag mit dem KI-Assistenten

Kapitel, Zusammenfassungen und Bezüge trägt ein KI-Kommandozeilenwerkzeug
extern in `beitrag.md` ein. Das ist nur vertretbar, weil drei Dinge gelten:

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
`anleitungen/REGELN.md` und `anleitungen/<aufgabe>.md`. Er wandert mit dem
Ordner — liegt er auf dem Netzlaufwerk, gelten beim Kollegen dieselben
Regeln. Die Vorlagen stehen unter `vorlagen/bibliothek/`; kopiert werden sie
von `lib/assistant/install.ts`, das **vorhandene Dateien nie überschreibt**
(eine angepasste Regel ist der Teil, den man anpasst).

## Werkzeugunabhängig, und warum das Arbeit war

Das Format war immer neutral — Marker-Blöcke, Kapitelzeilen, Wikilinks kann
jedes Programm schreiben. Der **Aufruf** war es nicht, an drei Stellen:

1. Das Programm hieß fest `claude`.
2. Übergeben wurde `/kapitel <slug>` — ein Slash-Befehl ist ein
   Claude-Code-Mechanismus (`.claude/commands/*.md`), sonst kennt ihn niemand.
3. Die Regeln lagen in `.claude/CLAUDE.md`, ebenfalls dessen Konvention.

Daraus folgt der heutige Aufbau, und jede Änderung daran muss ihn erhalten:

- **Die Anleitungen liegen in `anleitungen/`** und nennen kein Programm und
  keinen Slash-Befehl. `e2e/assistent.spec.ts` prüft das wörtlich — es sucht
  nach `claude` und nach `$1` und schlägt fehl, wenn eines davon auftaucht.
- **Übergeben wird ein gewöhnlicher Satz**, gebaut in `buildPrompt`:
  „Befolge die Anweisungen in anleitungen/kapitel.md. Es geht um den Beitrag
  X." Kurz genug für jede Kommandozeile, und es gibt nichts zu maskieren.
- **`AGENTS.md` in der Bibliothek** ist der neutrale Einstieg; viele
  Werkzeuge lesen diese Datei von selbst. `.claude/` bleibt als Abkürzung
  für `/kapitel` und verweist auf dieselben Anleitungen — Bequemlichkeit,
  kein zweiter Regelsatz.
- **Das Programm steht in `settings.assistantCommand`** (Standard `claude`),
  geprüft gegen `isToolName`: nur Buchstaben, Ziffern, Punkt, Bindestrich,
  Unterstrich. Kein Pfad, kein Leerzeichen — sonst stünde in der
  Kommandozeile plötzlich etwas anderes. Dieselbe Grammatik erzwingt
  `assistent-starten.ps1` noch einmal per `ValidatePattern`.

Erprobt ist auf dieser Maschine nur `claude`. Der Mechanismus ist geprüft:
mit `-Tool hostname -ToolArgs exec` baut das Skript nachweislich
`hostname exec '…'` zusammen.

## Der Knopf, der einen Prozess startet

`lib/assistant/start.ts` + `scripts/assistent-starten.ps1` — die gefährlichste
Stelle der Anwendung, und ein bewusst **löschbares Paar**: wer beides
entfernt, verliert einen Knopf. Der eigentliche Weg bleibt der Handbetrieb
(`cd S:\Mediathek`, das Werkzeug starten, den Auftrag eingeben), und er
steht auch so in der Oberfläche.

Vier Riegel, jeder für sich ausreichend:

1. **Autorenmodus** (`assertAuthorMode`). Im Viewer-Paket nicht einschaltbar.
2. **Server Action**, kein Route Handler: Next prüft dabei Origin gegen Host.
3. **Positivlisten.** Aufgabe gegen `ASSISTANT_TASKS`, Slug gegen
   `SLUG_PATTERN`, gegen den Index UND gegen das Dateisystem
   (`medien/<slug>/beitrag.md` muss existieren), Programm und Argumente gegen
   `isToolName`. Im PS-Skript zusätzlich `ValidatePattern` auf Werkzeug,
   Auftragstext und Slug — erst deshalb ist es vertretbar, für den Aufruf
   eine Kommandozeile zu bauen: dort kann kein Anführungszeichen und kein
   Semikolon stehen. Nie `shell: true`.
4. **Zehn Sekunden Sperre** zwischen zwei Starts, jeder Start ins
   maschinenlokale `assistent-starts.log`.

Dazu `proxy.ts` mit einer Host-Positivliste gegen DNS-Rebinding (die
Datei hieß bis Next 16.2 `middleware.ts`; `next build` weist auf die
Umbenennung hin): die
Bindung auf 127.0.0.1 allein genügt nicht, weil eine fremde Seite einen
eigenen Namen auf 127.0.0.1 auflösen lassen kann. Geprüft wird der **Name**,
nicht die Adresse.

Das Fenster ist **absichtlich sichtbar** (`Start-Process` mit `-NoExit`
und `-WindowStyle Normal`): man muss mitlesen, was in die eigenen Dateien
geschrieben wird. Der `-WindowStyle` ist nicht Kosmetik — der Node-Aufruf
läuft mit `windowsHide`, damit keine leere Konsole aufblitzt, und dieses
„versteckt" kann an das neue Fenster weitergereicht werden. Vorführen lässt
sich das Skript gefahrlos mit `-WhatIf`.

**Der Start wird AUSGEWERTET, nicht abgeschickt.** Vorher stand dort ein
`spawn` mit `stdio: "ignore"` und `unref()`, und die Funktion meldete Erfolg,
sobald `spawn` nicht sofort geworfen hatte — ein falscher Pfad, eine
abgelehnte Ausführungsrichtlinie, ein unerreichbarer Ordner blieben
unsichtbar, und der Knopf behauptete „Ein Fenster ist offen". Jetzt wird das
Hüllskript abgewartet (es ruft nur `Start-Process` und ist fertig), `stdout`
und `stderr` werden gelesen, und seine Meldung steht in der Oberfläche.

## Die Kette

Vier Schritte, und drei warten auf den vorigen:

```
Transkription → Kapitel → Suche → Bezüge
```

Ein Knopf am Beitrag („Alles erschließen") und einer auf `/auftraege`
stellen sie an; mit `autoChain` läuft sie nach jedem Import von selbst.
Gebaut ist sie als **vier gewöhnliche Aufträge in der vorhandenen Schlange**
(`lib/jobs/chain.ts`) — die ist ohnehin seriell, also ist die Reihenfolge des
Anstellens die Reihenfolge der Ausführung. Es gibt keinen zweiten
Ablaufplaner, und Fortschritt, Abbruch und Protokoll gelten unverändert.

**Die Reihenfolge ist die Begründung**, nicht bloß eine Anordnung: Kapitel
brauchen das Transkript, die Suche indiziert beides, und die Bezüge suchen
in allen Beiträgen — mit frischem Index und den Kapiteln als Orientierung.
Deshalb wird ein Glied ÜBERSPRUNGEN, sobald ein früheres nicht durchlief
(`#brokenChainStep` in `queue.ts`): Kapitel ohne Transkript wären erfunden,
und eine erfundene Kapitelzeile ist schlimmer als keine.

Angestellt wird nur, was fehlt (`needed` in `chain.ts`). Der Suchschritt ist
die Ausnahme — er ist immer fällig, weil sich der Bestand geändert hat.

### Der Preis: KI ohne Fenster

Bis hierher galt: **das Fenster ist absichtlich sichtbar**, man liest mit,
was in die eigenen Dateien geschrieben wird. Das ist richtig für einen
Beitrag und macht eine Kette unmöglich — ein Fenster, das auf eine Eingabe
wartet, ist kein Kettenglied, und dreißig Beiträge sind dreißig Fenster.

`lib/assistant/run.ts` startet das Werkzeug deshalb ohne Fenster. An die
Stelle des Mitlesens tritt nicht Vertrauen, sondern:

1. **Ausdrücklich eingeschaltet** (`autoAssistant`, Standard aus). Ohne das
   bietet die Kette nur ihre Maschinenschritte an und sagt das auch.
2. **Dieselben Riegel** wie beim Fenster — sie liegen jetzt gemeinsam in
   `lib/assistant/preflight.ts`, weil es zwei Starter gibt und zwei Kopien
   derselben Prüfungen die Sorte Verdopplung wären, bei der eine Seite
   vergessen wird.
3. **Derselbe Vertrag**: `anleitungen/` gilt unverändert, allen voran
   „geschrieben wird nur zwischen den Markern".
4. **Vollständiges Protokoll.** Jede Ausgabezeile geht ins Auftragsprotokoll,
   jeder Start zusätzlich in `assistent-starts.log`. Nachlesen statt zusehen.
5. **Der Prompt geht über stdin**, nie auf die Kommandozeile — wie beim Chat.

Die Argumente dafür sind Werkzeugsache und stehen in den Einstellungen
(`autoAssistantArgs`, Standard `-p --permission-mode acceptEdits`). Zwei
Dinge muss das Werkzeug können: einmalig antworten und dabei Dateien ändern
dürfen. Fehlt die Schreiberlaubnis, läuft der Schritt durch und hat nichts
getan — das ist der Fehler, den man hier zuerst sucht.

## Der Chat

Dasselbe Werkzeug, anders aufgerufen: nicht in einem sichtbaren Fenster,
sondern einmalig mit einer Frage, deren Antwort zurückgelesen wird
(`lib/assistant/chat.ts`, `app/api/chat/route.ts`). Damit lässt sich über den
eigenen Bestand reden, ohne einen zweiten Suchindex und ohne Einbettungen —
das Werkzeug liest die Transkripte selbst, weil sein Arbeitsverzeichnis die
Bibliothek ist.

Was daran nicht verhandelbar ist:

- **Er ist aus, bis er eingeschaltet wird** (`settings.chatEnabled`, unter
  Einstellungen → KI-Assistent). Jede Frage startet ein Programm auf dieser
  Maschine; das darf nicht beiläufig geschehen. Ohne Autorenmodus und im
  Viewer-Paket gibt es ihn gar nicht, und das Symbol in der Kopfzeile
  erscheint erst danach.
- **Die Frage geht über stdin, nie auf die Kommandozeile.** Chattext ist
  Freitext mit Anführungszeichen und Umbrüchen — auf einer Kommandozeile wäre
  das die Einladung, aus der Frage einen Befehl zu machen. Deshalb auch keine
  PowerShell dazwischen und `shell: false`.
- **Geantwortet wird im Strom.** Ein Werkzeug, das erst in den Dateien sucht,
  braucht schnell eine halbe Minute; ohne Strom hielte man es für kaputt.
  Bricht der Browser ab, wird der Prozess getötet (`cancel`).
- **Die Anweisung verbietet Erfinden und Schreiben.** Ein Gespräch ist keine
  Bearbeitung — was bleiben soll, gehört in einen Beitrag oder auf eine
  Themenseite. Der Verlauf lebt nur im Browser und nur in dieser Sitzung.
- **Der einmalige Aufruf ist werkzeugabhängig, die Argumente stehen deshalb
  in den Einstellungen** (`settings.chatArgs`, Standard `-p`). `codex` will
  `exec`, andere etwas anderes; kommt nichts zurück, nennt die Fehlermeldung
  genau das.

## Die Kopfzeile

Links das Logo und die drei Orte, an denen man etwas sucht (Medien, Themen,
Sammlungen), rechts das Suchfeld mit den Werkzeugen: Chat (nur wenn
eingeschaltet), Aufträge, Importieren, Einstellungen. **Werkzeuge sind
Symbole, keine Navigationspunkte** — sonst stünde die Suche zweimal oben und
„Mediathek" dreimal. Das Auftragssymbol lebt am Ereignisstrom
(`components/header-actions.tsx`): läuft etwas, dreht es sich und trägt die
Zahl der offenen Aufträge; erledigte lassen sich auf `/auftraege` wegräumen
(`clearFinishedJobs`).

Die Einstellungen sind in vier Seiten geteilt (`/einstellungen` Bibliothek,
`/einstellungen/verarbeitung`, `/einstellungen/assistent`,
`/einstellungen/programm`). Wer etwas hinzufügt, ordnet es einer davon zu —
eine fünfte Seite ist billiger als eine Seite mit vier Themen.

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
- **Eine Zeit in der Adresse schlägt die gemerkte Stelle.** vidstack stellt
  Lautstärke, Geschwindigkeit UND die zuletzt gesehene Stelle beim Ereignis
  „can-play" wieder her — also nach `loadedmetadata` und damit nach unserem
  Sprung aus `?t=`. Der gemeldete Fehler: eine Fundstelle führte richtig zu
  12:40 und warf den Zuschauer einen Wimpernschlag später dorthin zurück, wo
  er das letzte Mal aufgehört hatte; bei ungesehenen Beiträgen stimmte es,
  daher „manchmal". Deshalb bekommt der Player keinen Schlüssel als
  Zeichenkette mehr, sondern `PlayerStorage` (`media-view.tsx`): dieselbe
  Ablage wie zuvor, aber `getTime()` schweigt, solange die Adresse eine Zeit
  nennt. Gespeichert wird weiter — die neue Stelle soll ja gemerkt werden.
  Festgenagelt in `e2e/mediathek.spec.ts`, samt dem halben Wartemoment, ohne
  den der Test auch gegen den Fehler grün liefe.
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
- **Der Proxy puffert JEDEN Anfrage-Rumpf und kürzt ihn still bei 10 MB.**
  Aus der Next-Doku (`proxyClientMaxBodySize`): der Rumpf wird geklont und im
  Arbeitsspeicher gehalten, damit Proxy und Route ihn beide lesen können; über
  der Grenze wird gekürzt, und „the request will **not** fail or return an
  error to the client". Es genügt, dass `proxy.ts` EXISTIERT. Real passiert:
  nach Etappe 3 kamen alle importierten Videos exakt 10,0 MB groß an, ließen
  sich nicht abspielen, und ffprobe konnte sie nicht lesen.
  **Das Limit hochzusetzen ist keine Lösung** — gepuffert wird im Speicher,
  und genau deshalb streamt die Upload-Route. Wer eine Route mit großem Rumpf
  baut, muss sie im Matcher von `proxy.ts` ausschließen UND die Host-Prüfung
  selbst aufrufen (`lib/http/host.ts`). Die Upload-Route vergleicht zusätzlich
  die abgelegte Größe mit der `Content-Length` und lehnt ab, statt eine halbe
  Datei einzulesen; `e2e/import.spec.ts` lädt dafür 11 MB hoch.
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

## Das weitergebbare Paket

`npm run paket` baut `dist/Mediathek/` — einen Ordner, den man kopiert und
per Doppelklick startet. **Nichts zu installieren**: `node.exe` und ffmpeg
liegen darin. Die Ausnahme bleibt Python samt Whisper-Modellen; die sind
mehrere Gigabyte groß und werden bei Bedarf einmalig geladen.

Vier Dinge, die dabei nicht kaputtgehen dürfen:

- **`.next/static` und `public` kopiert der standalone-Build NICHT mit.** Die
  App rendert dann, hat aber kein CSS und hydratisiert nicht — das sieht wie
  ein Build-Fehler aus und ist ein fehlender Ordner. Der Smoke-Test
  (`npm run paket:smoke`) lädt deshalb nicht nur `/`, sondern auch das
  Stylesheet, das die Seite nennt.
- **`outputFileTracingExcludes` wirkt unter Turbopack nicht** (Stand Next
  16.3). `scripts/paket.mjs` filtert selbst und prüft danach. Dabei gilt
  `NIE_OBEN` nur für die oberste Ebene: ein `dist/` dort ist das zuletzt
  gebaute Paket, das sich sonst bei jedem Lauf selbst einpackt (nachgemessen
  315 MB → 600 MB); ein `dist/` in `node_modules` muss dagegen mit.
- **Das Arbeitsverzeichnis ist `app/`.** `vorlagen/`, `scripts/`, `tools/`
  und `ffmpeg/bin` werden gegen `process.cwd()` aufgelöst und liegen deshalb
  dort — sonst fehlt dem Autorenmodus die halbe Ausstattung.
- **Eine Datei zum Anklicken: `Mediathek.cmd`.** Sie startet ohne
  Konsolenfenster, indem sie sich selbst noch einmal aufruft — unsichtbar
  über `wscript` und `app/ohne-konsole.vbs`, das mit `/intern` sagt: du bist
  schon der zweite Aufruf. Der erste blitzt dabei kurz auf; das ist der Preis
  dafür, dass oben genau eine Datei liegt und keine zweite erklärt werden
  muss. Fehlt `wscript.exe` (VBScript ist abkündigt), bleibt die Konsole
  stehen statt gar nichts zu tun.
- **Die Konsole ist einschaltbar, nicht wegdefiniert**: `Mediathek.cmd
  /konsole` (auch in den Eigenschaften einer Verknüpfung im Feld „Ziel"),
  eine Datei `konsole.txt` daneben, oder `MEDIATHEK_KONSOLE=1`. Wer einen
  Fehler sucht, braucht die Meldungen — sie dürfen nicht nur im Quelltext
  erreichbar sein.
- **Starter und VBS sind REINES ASCII, und das wird geprüft.** cmd.exe liest
  byteweise: ein UTF-8-Umlaut hinter `chcp 65001` verschiebt das Lesen (aus
  `setlocal` wurde `tlocal`), und ein Zeichen, das die ASCII-Kodierung nicht
  kennt, wird beim Schreiben zu einem NUL-Byte — eine Trennlinie aus
  Kästchenzeichen reichte, damit cmd.exe die folgenden Zeilen falsch
  auswertete und der Start still in den Konsolen-Zweig lief.
  `nurAsciiSchreiben` in `scripts/paket.mjs` bricht den Bau ab, statt sich auf
  Disziplin zu verlassen.
- **Die Verknüpfung entsteht auf Klick, nicht im Paket** (Einstellungen →
  Programm). Eine .lnk merkt sich einen absoluten Pfad; mitgeliefert zählte
  sie nach dem ersten Kopieren ins Leere — und Kopieren ist genau der Zweck
  des Pakets. Sie zeigt direkt auf `app/ohne-konsole.vbs` und startet damit
  ganz ohne Aufblitzen. Das Symbol (`scripts/icon.mjs`) wird beim Packen
  gezeichnet und von Hand als ICO geschrieben: eine Bilderbibliothek nur
  dafür wäre eine Abhängigkeit mehr im Bau eines Programms, dessen Witz das
  Fehlen von Abhängigkeiten ist.
- **Ein eigenes Fenster, kein Browser-Tab.** Der Starter ruft Edge (sonst
  Chrome) mit `--app=` und einem eigenen `--user-data-dir`. Das zweite ist
  nicht Kosmetik: nur mit eigenem Profil klinkt sich der Aufruf nicht in eine
  laufende Browser-Sitzung ein, wartet also bis zum Schließen des Fensters —
  und erst dadurch kann der Starter den Server danach beenden. Die
  Prozesskennung dafür schreibt `app/start.js` in eine Datei; aus einer
  cmd-Datei ist die PID eines mit `start /b` gestarteten Prozesses sonst
  nicht zu bekommen.

## Der erste Start

Ohne bekannten Bibliotheksordner zeigt `app/layout.tsx` **statt** der App den
Begrüßungsschirm (`components/start/willkommen.tsx`) — im Layout und nicht
als Weiterleitung, damit jede Adresse dorthin führt und es keine Schleife
gibt.

- **Der Pfad muss sichtbar sein, bevor geklickt wird.** „Verzeichnis" plus
  „Name" ergibt `<Verzeichnis>/<Name>`, und genau das steht als vollständiger
  Pfad auf dem Schirm. Ein Knopf, nach dem irgendwo ein Ordner entstanden
  ist, den man nicht wiederfindet, ist schlimmer als eine Frage mehr.
- **Der Nicht-Verschachteln-Vorschlag.** Wer `D:\Mediathek` im Explorer
  anlegt, auswählt und „Mediathek" tippt, meint diesen Ordner — nicht
  `D:\Mediathek\Mediathek`. Heißt der gewählte Ordner schon so (ohne
  Rücksicht auf Groß- und Kleinschreibung), wird angeboten, ihn selbst zu
  nehmen. **Angeboten, nicht entschieden**: `D:\Projekte\Projekte` kann
  jemand so wollen. Die Regel ist rein und getestet
  (`lib/library/new-library.ts`).
- **Der Ordner-Dialog ist der des Betriebssystems** (`lib/shell/pick-folder.ts`,
  PowerShell mit WinForms, `-STA` ist Pflicht). Eine Webseite kann keinen
  Ordner wählen: `webkitdirectory` liefert Dateinamen, nie den Pfad. In den
  Aufruf geht NICHTS hinein — er öffnet einen Dialog und gibt zurück, was
  ein Mensch angeklickt hat.
- **Ohne Bibliothek wird nicht gescannt** (`instrumentation.ts`). Sonst läuft
  der erste Scan gegen den eingebauten Standard, also
  `<Programmordner>/bibliothek-dev`, und legt ihn beim Schreiben des
  Zwischenspeichers an. Ab dem zweiten Start hätte das Programm sich selbst
  eine Bibliothek erfunden — im eigenen Verzeichnis, das beim nächsten Update
  verschwindet. Zwei weitere Riegel dagegen: `firstRunState` verlangt vom
  eingebauten Standard ein echtes `medien/`, und `writeCache` legt den
  Bibliotheksordner selbst NIE an.
- **Eine leere `MEDIATHEK_LIBRARY_DIR` gilt als nicht gesetzt.** Mit `??`
  ergab sie den leeren String, `path.resolve("")` ist das
  Arbeitsverzeichnis — und der Programmordner wurde zur Bibliothek. Genau so
  kommt die Variable aus einer cmd-Datei mit leerer `bibliothek.txt`
  (`lib/paths.test.ts`).

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

**Der Start des Assistenten wird NICHT im Testlauf geprüft** — er öffnet ein
Fenster auf der Maschine, in dem ein Sprachmodell in die Bibliothek schreibt.
`e2e/assistent.spec.ts` prüft alles davor: die Riegel, die Beschriftungen und
die Host-Abweisung. Das PS-Skript selbst lässt sich gefahrlos vorführen:

```powershell
.\scripts\assistent-starten.ps1 -LibraryDir S:\Mediathek -Tool claude -Prompt "Befolge die Anweisungen in anleitungen/kapitel.md." -WhatIf
```

**Für Etappe 4 vorgemerkt:** `outputFileTracingExcludes` wirkt unter Turbopack
(Stand Next 16.3) nicht — der standalone-Build enthält `bibliothek-dev` samt
Mediendateien, obwohl die Angabe in `next.config.ts` korrekt gesetzt ist. Das
Paketskript muss deshalb selbst filtern und danach prüfen, dass keine
Mediendatei, kein `tools/` und keine `.env` im Paket liegt.

## Umgebungsvariablen

| Variable                | Wirkung                                                                                                                                                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MEDIATHEK_LIBRARY_DIR` | Bibliotheksordner, und zwar **fest**: ist sie gesetzt, lässt sich der Ordner in der Oberfläche nicht umstellen. Ohne sie gilt der unter Einstellungen gewählte, sonst `./bibliothek-dev`. Auf Netzlaufwerken besser UNC-Pfade — gemappte Buchstaben sind an die Windows-Sitzung gebunden. |
| `MEDIATHEK_READONLY=1`  | Harter Riegel für das weitergegebene Viewer-Paket: der Autorenmodus lässt sich dann nicht einschalten.                                                                                                                                                                                    |
| `MEDIATHEK_FFMPEG_DIR`  | Verzeichnis mit `ffmpeg.exe` UND `ffprobe.exe`. Immer das **Verzeichnis** — der übliche Windows-Build ist ein shared build mit sieben DLLs daneben.                                                                                                                                       |
| `MEDIATHEK_POLL_MS`     | Poll-Abstand des Beobachters, Standard 30 s.                                                                                                                                                                                                                                              |
| `MEDIATHEK_HOSTS`       | Zusätzlich erlaubte Host-Namen (Komma-getrennt). Ohne sie antwortet die Mediathek nur auf `127.0.0.1` und `localhost` — siehe `proxy.ts`.                                                                                                                                                 |
| `HOSTNAME=127.0.0.1`    | Für den Produktionsstart Pflicht: **ohne sie bindet Next standalone auf `0.0.0.0`** und die Mediathek wäre im Firmennetz offen.                                                                                                                                                           |

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

Zum täglichen Benutzen gibt es **`Mediathek starten.bat`**: Doppelklick,
Browser öffnet sich, Fenster offen lassen. Sie startet bewusst `npm run dev`
und nicht den Produktionsserver — die Begründung steht ausführlich in der
Datei, kurz: `next start` lehnt Next selbst ab, solange
`output: "standalone"` gesetzt ist, und `node .next/standalone/server.js`
läuft mit einem anderen Arbeitsverzeichnis, wodurch der Standard-
Bibliotheksordner ins Leere zeigt. Zwei Dinge, die dabei nicht offensichtlich
sind und in der Datei erklärt stehen:

- **Die .bat enthält keine Umlaute.** `cmd.exe` liest sie byteweise; mit
  `chcp 65001` oben und einem UTF-8-Umlaut weiter unten verrutscht das Lesen
  (nachgemessen: aus `setlocal` wurde `tlocal`, Abbruch mit „Syntaxfehler").
  Das `chcp` bleibt trotzdem — es richtet die Konsole für die Ausgaben von
  Node und Next ein, und die haben Umlaute.
- **`ping -n` statt `timeout`** zum Warten: `timeout` bricht ab, sobald die
  Eingabe umgeleitet ist.

Der echte Produktionsstarter gehört ins Viewer-Paket (Etappe 4) — dort mit
fertigem Bau, eigener `node.exe` und einem absichtlich festen
Bibliotheksordner.

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

**Fragen:** jede Chat-Antwort wird als `fragen/<slug>.md` abgelegt, Belege
sind anklickbare Wikilinks, das Internet ist zuschaltbare Zweitquelle, und
das Zusammenfassen ordnet den Bestand.

**Etappe 4:** ein Ordner zum Kopieren mit eigenem Fenster, Erststart-Dialog
mit nativer Ordnerwahl, node und ffmpeg mitgeliefert.

**Kette:** ein Knopf statt vier — Transkription, Kapitel, Suche, Bezüge
laufen der Reihe nach als Aufträge, wahlweise auch nach jedem Import.

**Danach, aus dem Gebrauch heraus:** wählbarer Bibliotheksordner samt
`Mediathek starten.bat`, Automatik nach dem Import (`lib/jobs/auto.ts`),
werkzeugunabhängiger Assistent, Sammlungen aus der Oberfläche, Kopfzeile mit
Symbolen statt Navigationspunkten, Chat über den Bestand, Einstellungen in
vier Seiten.

Noch offen: die Vektorsuche (bewusst zurückgestellt, solange der Chat die
bedeutungsnahe Suche übernimmt) und ein Durchlauf des Pakets auf einer
fremden Maschine mit Firmen-Virenschutz.
