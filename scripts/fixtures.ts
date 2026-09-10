/*
 * Legt eine Entwicklungsbibliothek unter ./bibliothek-dev an.
 *
 * Die Mediendateien sind echt, aber winzig (32x32, wenige Kilobyte) — sie
 * werden mit ffmpeg erzeugt, sodass Dauer, Kachelbild und das Springen im
 * Player wirklich geprüft werden können. Fehlt ffmpeg, entstehen die
 * Textbeiträge trotzdem.
 *
 * Absichtlich enthalten: ein Beitrag mit kaputtem Frontmatter, ein Kapitel
 * hinter dem Ende und ein Ordner ohne alles. Das ist kein Versehen, sondern
 * der Prüfstein dafür, dass die Bibliothek Fehler aushält statt abzustürzen.
 *
 *   npm run fixtures
 */

import { spawnSync } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { installClaudeFiles } from "@/lib/claude/install";
import { setLibraryRoot } from "@/lib/paths";

const ROOT = path.join(process.cwd(), "bibliothek-dev");
const ITEMS = path.join(ROOT, "medien");
const TOPICS = path.join(ROOT, "themen");
const COLLECTIONS = path.join(ROOT, "sammlungen");

/**
 * Der Text, den das Sprachmemo spricht.
 *
 * Er enthält absichtlich Fachbegriffe, die ein Modell ohne Glossar
 * verhört — "Elios 3" wird sonst zu "Eliös 3". So lässt sich beim
 * Transkribieren nachprüfen, ob die Fachbegriffe aus glossar.txt greifen.
 *
 * Die Zahlen sind ausgeschrieben, weil die Windows-Sprachausgabe sie sonst
 * unterschiedlich vorliest.
 */
const SPRACHMEMO_TEXT = [
  "Willkommen zur Vorflugkontrolle der Elios drei.",
  "Ich gehe die Punkte in der Reihenfolge durch,",
  "in der ich sie im Feld auch abarbeite.",
  "Zuerst der Akku. Ich messe die Zellspannung mit dem Zellspannungspruefer.",
  "Unter drei Komma sieben Volt je Zelle nehme ich den Akku nicht mit ins Feld.",
  "Auf Aufblaehung achten. Ein aufgeblaehter Akku wird sofort aussortiert.",
  "Jetzt der Rotorschutz. Der Kaefig rastet an sechs Punkten ein.",
  "Ein lose sitzender Schutz ist im Kanal schlimmer als gar keiner.",
  "Nach dem Flug halte ich Flugzeit und Auffaelligkeiten im Messprotokoll fest.",
].join(" ");

function findFfmpeg(): string | null {
  const candidates = [
    process.env.MEDIATHEK_FFMPEG_DIR
      ? path.join(process.env.MEDIATHEK_FFMPEG_DIR, "ffmpeg.exe")
      : null,
    "ffmpeg",
    "C:\\ffmpeg-master-latest-win64-gpl-shared\\bin\\ffmpeg.exe",
  ].filter((entry): entry is string => entry !== null);

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["-version"], {
      stdio: "ignore",
      windowsHide: true,
    });
    if (probe.status === 0) return candidate;
  }
  return null;
}

const ffmpeg = findFfmpeg();

function run(args: string[]): boolean {
  if (!ffmpeg) return false;
  const result = spawnSync(ffmpeg, args, {
    stdio: "ignore",
    windowsHide: true,
  });
  return result.status === 0;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeFile(file: string, content: string) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, content, "utf8");
}

/** Ein winziges Testvideo mit Ton, moov vorne. */
function makeVideo(file: string, seconds: number): boolean {
  return run([
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `testsrc=size=32x32:rate=10:duration=${seconds}`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=440:duration=${seconds}`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "16k",
    "-shortest",
    "-movflags",
    "+faststart",
    file,
  ]);
}

/**
 * Gesprochener deutscher Text über die Windows-Sprachausgabe.
 *
 * Deutlich nützlicher als ein Sinuston: damit lässt sich die Transkription
 * wirklich prüfen — ob das Modell läuft, ob die Fachbegriffe aus dem Glossar
 * greifen, ob die Zeitmarken passen. Ohne Sprachausgabe (kein Windows, keine
 * deutsche Stimme) fällt es auf einen Ton zurück.
 */
function makeSpeechWav(file: string, text: string): boolean {
  if (process.platform !== "win32") return false;

  /*
   * Skript und Text gehen als DATEIEN hinein, nicht über stdin.
   *
   * Nachgemessen: mit `powershell -Command -` liest PowerShell das Skript
   * selbst von stdin, und ein anschließendes ReadToEnd() bekommt nur noch
   * einen Rest — gesprochen wurden dann 4,8 statt 40 Sekunden. Über den
   * Umweg Datei gibt es diesen Konflikt nicht, und der Text landet auch
   * nicht auf einer Kommandozeile.
   */
  const scriptFile = path.join(
    os.tmpdir(),
    `mediathek-sprache-${process.pid}.ps1`,
  );
  const textFile = path.join(
    os.tmpdir(),
    `mediathek-sprache-${process.pid}.txt`,
  );

  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$deutsch = $s.GetInstalledVoices() |
  Where-Object { $_.VoiceInfo.Culture.Name -like 'de*' } |
  Select-Object -First 1
if (-not $deutsch) { exit 2 }
$s.SelectVoice($deutsch.VoiceInfo.Name)
$s.SetOutputToWaveFile(${JSON.stringify(file)})
$s.Speak([System.IO.File]::ReadAllText(${JSON.stringify(textFile)}, [System.Text.Encoding]::UTF8))
$s.SetOutputToNull()
$s.Dispose()
`;

  try {
    fsSync.writeFileSync(scriptFile, script, "utf8");
    fsSync.writeFileSync(textFile, text, "utf8");

    const result = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptFile,
      ],
      { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
    );
    if (result.status !== 0) return false;
    // Vier Sekunden wären ein abgebrochener Lauf; der Text ist deutlich länger.
    return fsSync.statSync(file).size > 100_000;
  } catch {
    return false;
  } finally {
    for (const temporary of [scriptFile, textFile]) {
      try {
        fsSync.rmSync(temporary, { force: true });
      } catch {
        // Liegenlassen ist harmlos, es ist der Temp-Ordner.
      }
    }
  }
}

function makeAudio(file: string, seconds: number, text?: string): boolean {
  // Die Zwischendatei gehört in den Temp-Ordner, NICHT in die Bibliothek:
  // dort wäre sie eine Fremddatei im Beitragsordner.
  const work = path.join(os.tmpdir(), `mediathek-sprache-${process.pid}.wav`);

  try {
    if (text && makeSpeechWav(work, text)) {
      const ok = run([
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        work,
        "-c:a",
        "aac",
        "-b:a",
        "64k",
        "-movflags",
        "+faststart",
        file,
      ]);
      if (ok) return true;
    }
  } finally {
    try {
      fsSync.rmSync(work, { force: true });
    } catch {
      // Siehe oben.
    }
  }

  // Ohne Sprachausgabe bleibt ein Ton — Dauer und Kapitel lassen sich damit
  // prüfen, nur die Transkription nicht.
  return run([
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=330:duration=${seconds}`,
    "-c:a",
    "aac",
    "-b:a",
    "24k",
    "-movflags",
    "+faststart",
    file,
  ]);
}

function makePoster(file: string): boolean {
  return run([
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=640x360:rate=1:duration=1",
    "-frames:v",
    "1",
    "-q:v",
    "5",
    file,
  ]);
}

function makeImage(file: string): boolean {
  return run([
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x308964:size=320x200:duration=1",
    "-frames:v",
    "1",
    file,
  ]);
}

/** Ein minimales, gültiges einseitiges PDF — ohne Abhängigkeit. */
function minimalPdf(title: string): string {
  const text = title.replace(/[()\\]/g, "");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] " +
      "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];
  const stream = `BT /F1 18 Tf 72 760 Td (${text}) Tj ET\n`;
  objects.push(
    `5 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`,
  );

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += object;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefStart}\n%%EOF\n`;
  return pdf;
}

async function main() {
  /*
   * Ausdrücklich festnageln: dieses Skript ERZEUGT bibliothek-dev. Ohne das
   * würde installClaudeFiles() den unter Einstellungen gewählten Ordner
   * nehmen — und der Vertrag landete in der echten Bibliothek.
   */
  setLibraryRoot(ROOT);

  console.log(`Bibliothek: ${ROOT}`);
  console.log(ffmpeg ? `ffmpeg: ${ffmpeg}` : "ffmpeg: nicht gefunden");

  await fs.rm(ROOT, { recursive: true, force: true });
  await ensureDir(ITEMS);
  await ensureDir(TOPICS);

  // ------------------------------------------------ 1. Video mit Kapiteln
  const videoSlug = "vorflugkontrolle-elios-3";
  const videoDir = path.join(ITEMS, videoSlug);
  await ensureDir(videoDir);
  const hasVideo = makeVideo(path.join(videoDir, "video.mp4"), 180);
  makePoster(path.join(videoDir, "poster.jpg"));
  await writeFile(
    path.join(videoDir, "beitrag.md"),
    `---
titel: Vorflugkontrolle Elios 3
schlagworte: [elios-3, vorflug, sicherheit]
aufgenommen: 2026-04-17
dauer: "00:03:00"
---

Wie ich vor jedem Flug die Elios 3 durchgehe, in der Reihenfolge, in der ich
es tatsächlich mache. Der Prüfzettel liegt als Anhang dabei.

Wer nur den Akkuteil braucht: der beginnt bei 00:30.

<!-- kapitel:start -->
00:00 Einleitung und Ziel
00:30 Akku prüfen
01:20 Rotorschutz montieren
02:10 Nachbereitung
<!-- kapitel:ende -->

<!-- zusammenfassung:start -->
Der vollständige Durchgang der Vorflugkontrolle an der Elios 3, von der
Sichtprüfung über den Akku bis zum montierten Rotorschutz. Am Ende steht,
was nach dem Flug zu dokumentieren ist.
<!-- zusammenfassung:ende -->

<!-- kapitelzusammenfassungen:start -->
### 00:30 Akku prüfen
Zellspannung messen, auf Aufblähung und Temperatur achten. Ein Akku unter
3,7 Volt je Zelle geht nicht mit ins Feld.

### 01:20 Rotorschutz montieren
Der Käfig muss an allen sechs Punkten einrasten. Ein lose sitzender Schutz
ist im Kanal schlimmer als keiner.
<!-- kapitelzusammenfassungen:ende -->

<!-- bezuege:start -->
- [[akku-grundlagen#00:15]] Dort erkläre ich die Zellspannungsmessung genauer
- [[messprotokoll-lesen#akku-und-spannung]] Wie das Ergebnis ins Protokoll kommt
<!-- bezuege:ende -->

<!-- anhaenge:start -->
- pruefzettel.pdf — Prüfzettel zum Ausdrucken
- rotorschutz.png — Die sechs Einrastpunkte
<!-- anhaenge:ende -->
`,
  );
  await writeFile(
    path.join(videoDir, "anhaenge", "pruefzettel.pdf"),
    minimalPdf("Pruefzettel Vorflugkontrolle Elios 3"),
  );
  makeImage(path.join(videoDir, "anhaenge", "rotorschutz.png"));
  // Ein Transkript, damit der Transkript-Tab etwas zeigt.
  await writeFile(
    path.join(videoDir, "transcript.json"),
    JSON.stringify(
      {
        version: 1,
        model: "large-v3-turbo",
        language: "de",
        duration_sec: 180,
        segments: [
          {
            start: 0,
            end: 8,
            text: "Willkommen zur Vorflugkontrolle der Elios 3.",
          },
          {
            start: 8,
            end: 26,
            text: "Ich gehe die Punkte in der Reihenfolge durch, in der ich sie im Feld auch abarbeite.",
          },
          {
            start: 30,
            end: 48,
            text: "Zuerst der Akku. Ich messe die Zellspannung mit dem Prüfer.",
          },
          {
            start: 48,
            end: 70,
            text: "Unter 3,7 Volt je Zelle nehme ich den Akku nicht mit ins Feld.",
          },
          {
            start: 80,
            end: 98,
            text: "Auf Aufblähung achten. Ein aufgeblähter Akku wird sofort aussortiert.",
          },
          {
            start: 100,
            end: 118,
            text: "Die Temperatur sollte in der Nähe der Umgebungstemperatur liegen.",
          },
          {
            start: 122,
            end: 140,
            text: "Jetzt der Rotorschutz. Der Käfig rastet an sechs Punkten ein.",
          },
          {
            start: 140,
            end: 160,
            text: "Ein lose sitzender Schutz ist im Kanal schlimmer als gar keiner.",
          },
          {
            start: 162,
            end: 178,
            text: "Nach dem Flug halte ich Flugzeit und Auffälligkeiten im Protokoll fest.",
          },
        ],
      },
      null,
      2,
    ),
  );

  // ------------------------------------------------ 2. Sprachmemo (Audio)
  const audioSlug = "akku-grundlagen";
  const audioDir = path.join(ITEMS, audioSlug);
  await ensureDir(audioDir);
  const hasAudio = makeAudio(
    path.join(audioDir, "audio.m4a"),
    90,
    SPRACHMEMO_TEXT,
  );
  await writeFile(
    path.join(audioDir, "beitrag.md"),
    `---
titel: Akku-Grundlagen, unterwegs diktiert
schlagworte: [akku, elektrik, grundlagen]
aufgenommen: 2026-04-20
---

Ein Sprachmemo aus dem Auto. Unstrukturiert, aber die Zahlen stimmen.

<!-- kapitel:start -->
00:00 Warum Zellspannung überhaupt zählt
00:08 Messen mit dem Zellprüfer
00:18 Was Aufblähung bedeutet
00:24 Rotorschutz
<!-- kapitel:ende -->

<!-- zusammenfassung:start -->
Kurz zusammengefasst, warum die Zellspannung die aussagekräftigste
Einzelgröße am Akku ist und wie man sie im Feld misst.
<!-- zusammenfassung:ende -->

<!-- kapitelzusammenfassungen:start -->
<!-- kapitelzusammenfassungen:ende -->

<!-- bezuege:start -->
- [[vorflugkontrolle-elios-3#00:30]] Der Akkuteil der Vorflugkontrolle
<!-- bezuege:ende -->
`,
  );

  // ------------------------------------------------ 3. Textbeitrag
  const textSlug = "messprotokoll-lesen";
  const textDir = path.join(ITEMS, textSlug);
  await ensureDir(textDir);
  await writeFile(
    path.join(textDir, "beitrag.md"),
    `---
titel: Ein Messprotokoll lesen
schlagworte: [protokoll, messung, grundlagen]
aufgenommen: 2026-04-22
---

Ein Messprotokoll sieht nach viel aus, trägt aber nur vier Aussagen. Dieser
Text geht sie der Reihe nach durch.

## Kopfdaten prüfen

Objekt, Datum, Gerät und Prüfer. Fehlt eines davon, ist das Protokoll für
eine Nachprüfung wertlos — auch wenn die Messwerte in Ordnung sind.

## Akku und Spannung

Die Spannungswerte stehen als Reihe je Zelle. Interessant ist nicht der
Mittelwert, sondern die Spreizung: mehr als 0,05 Volt Unterschied zwischen
der höchsten und der niedrigsten Zelle bedeutet, dass der Akku bald
auffällig wird.

### Grenzwerte

Unter 3,7 Volt je Zelle wird nicht geflogen. Das ist keine Empfehlung.

## Auffälligkeiten

Freitextfeld. Hier steht, was später niemand mehr rekonstruieren kann, wenn
es fehlt.

<!-- zusammenfassung:start -->
Die vier Aussagen eines Messprotokolls: Kopfdaten, Spannungsreihe,
Grenzwerte und der Freitext für Auffälligkeiten.
<!-- zusammenfassung:ende -->

<!-- bezuege:start -->
- [[akku-grundlagen#00:15]] Wie die Spannungswerte zustande kommen
<!-- bezuege:ende -->
`,
  );
  await writeFile(
    path.join(textDir, "anhaenge", "protokoll-muster.pdf"),
    minimalPdf("Musterprotokoll"),
  );

  // ------------------- 4. Kaputtes Frontmatter: muss trotzdem funktionieren
  const brokenSlug = "kaputter-kopf";
  const brokenDir = path.join(ITEMS, brokenSlug);
  await ensureDir(brokenDir);
  makeVideo(path.join(brokenDir, "video.mp4"), 60);
  await writeFile(
    path.join(brokenDir, "beitrag.md"),
    `---
titel: [das ist kaputt
schlagworte: {auch: kaputt
dauer: gestern
---

Dieser Beitrag hat einen unlesbaren Kopf. Er muss trotzdem abspielbar sein,
der Titel kommt dann aus dem Ordnernamen.

<!-- kapitel:start -->
00:00 Anfang
01:12:00 Kapitel hinter dem Ende
00:10 Absichtlich unsortiert
00:10 Doppelte Zeit
<!-- kapitel:ende -->
`,
  );

  // ------------------- 5. Ordner ohne alles: darf nur einen Hinweis erzeugen
  await ensureDir(path.join(ITEMS, "leerer-ordner"));

  // ------------------- 6. Video ohne beitrag.md
  const bareSlug = "ohne-beschreibung";
  const bareDir = path.join(ITEMS, bareSlug);
  await ensureDir(bareDir);
  makeVideo(path.join(bareDir, "video.mp4"), 30);

  // ------------------------------------------------------------- Themen
  await writeFile(
    path.join(TOPICS, "drohnen-grundlagen.md"),
    `---
titel: Drohnen-Grundlagen
schlagworte: [grundlagen]
---

Der Einstieg für neue Kollegen. Reihenfolge einhalten — der Akkuteil baut
auf der Vorflugkontrolle auf.

- [[vorflugkontrolle-elios-3]]
- [[akku-grundlagen]]
- [[messprotokoll-lesen]]
- [[gibt-es-nicht]]
`,
  );

  /*
   * Ein Thema der zweiten Art: keine geordneten Beiträge, sondern Synonyme
   * und einzelne Fundstellen — so sieht eine von "/themen" erzeugte Seite
   * aus. Die Synonyme erweitern die Suchanfrage.
   */
  await writeFile(
    path.join(TOPICS, "zellspannungsmessung.md"),
    `---
titel: Zellspannungsmessung
synonyme: [Balancing, Spannungsspreizung, Zellprüfer]
schlagworte: [akku]
---

Die Zellspannung ist die aussagekräftigste Einzelgröße am Akku. Wichtig ist
nicht der Mittelwert, sondern die Spreizung zwischen der höchsten und der
niedrigsten Zelle.

<!-- fundstellen:start -->
- [[akku-grundlagen#00:08]] Messen mit dem Zellprüfer
- [[vorflugkontrolle-elios-3#00:30-01:20]] Im Ablauf der Vorflugkontrolle
- [[messprotokoll-lesen#akku-und-spannung]] Wie das Ergebnis ins Protokoll kommt
<!-- fundstellen:ende -->
`,
  );

  // ---------------------------------------------------------- Sammlungen
  await ensureDir(COLLECTIONS);
  await writeFile(
    path.join(COLLECTIONS, "alles-zum-akku.md"),
    `---
titel: Alles zum Akku
schlagworte: [akku]
---

Was ich einem neuen Kollegen zum Akku zeigen würde, in dieser Folge. Der
zweite Ausschnitt endet mitten im Beitrag — genau darum geht es hier.

- [[akku-grundlagen#00:08-00:18]] Messen mit dem Zellprüfer
- [[vorflugkontrolle-elios-3#00:30-01:20]] Im Ablauf der Vorflugkontrolle
- [[messprotokoll-lesen#akku-und-spannung]] Und im Protokoll
`,
  );

  await writeFile(
    path.join(COLLECTIONS, "ueberall-spannung.md"),
    `---
titel: Überall, wo es um Spannung geht
suche: zellspannung
---

Eine gespeicherte Suche: sie läuft bei jedem Aufruf neu. Kommt ein Beitrag
dazu, steht er von selbst mit drin.
`,
  );

  /*
   * Der Vertrag mit Claude Code gehört in die Bibliothek, nicht in die
   * Anwendung: er wandert mit dem Ordner mit. Beim Kollegen auf dem
   * Netzlaufwerk gelten dieselben Regeln.
   */
  await installClaudeFiles();

  await writeFile(
    path.join(ROOT, "glossar.txt"),
    `Elios 3
Zellspannung
Rotorschutz
Vorflugkontrolle
Messprotokoll
`,
  );

  console.log("");
  console.log("Angelegt:");
  console.log(
    `  ${videoSlug}      Video  ${hasVideo ? "(mit Mediendatei)" : "(OHNE Mediendatei)"}`,
  );
  console.log(
    `  ${audioSlug}            Audio  ${hasAudio ? "(mit Mediendatei)" : "(OHNE Mediendatei)"}`,
  );
  console.log(`  ${textSlug}       Text`);
  console.log(`  ${brokenSlug}             Video, kaputter Kopf (Absicht)`);
  console.log(`  ohne-beschreibung        Video ohne beitrag.md (Absicht)`);
  console.log(`  leerer-ordner            ohne alles (Absicht)`);
  console.log("");
  console.log(
    "  Themen:      drohnen-grundlagen (geordnet), " +
      "zellspannungsmessung (Synonyme + Fundstellen)",
  );
  console.log(
    "  Sammlungen:  alles-zum-akku (Ausschnitte), " +
      "ueberall-spannung (gespeicherte Suche)",
  );
  console.log("");
  if (!ffmpeg) {
    console.log(
      "Hinweis: ohne ffmpeg gibt es keine Mediendateien und keine " +
        "Kachelbilder. Die Textbeiträge funktionieren trotzdem.",
    );
  }
}

void main();
