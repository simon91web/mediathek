import "server-only";

import { spawn } from "node:child_process";

import { paths } from "@/lib/paths";
import { readSettings } from "@/lib/settings";

/*
 * Der Chat über die Bibliothek.
 *
 * Dasselbe Werkzeug wie bei den Aufgaben, nur anders aufgerufen: nicht in
 * einem sichtbaren Fenster, sondern einmalig mit einer Frage, deren Antwort
 * zurückgelesen wird. Welches Programm, steht in den Einstellungen.
 *
 * DREI FESTLEGUNGEN, die den Unterschied machen:
 *
 * 1. **Die Frage geht über stdin, nicht über die Kommandozeile.** Ein
 *    Chattext ist Freitext — beliebig lang, mit Anführungszeichen, Umbrüchen
 *    und allem. Auf einer Kommandozeile wäre das die Einladung, aus der
 *    Frage einen Befehl zu machen. Über stdin gibt es nichts zu maskieren,
 *    und die Länge ist egal. Deshalb ist hier auch keine PowerShell
 *    dazwischen: der Prozess wird direkt gestartet, ohne Shell.
 *
 * 2. **Das Arbeitsverzeichnis ist die Bibliothek.** Damit liest das Werkzeug
 *    die Transkripte, Beiträge und Themenseiten selbst — es sucht sich seine
 *    Belege. Genau das kann ein Kommandozeilenwerkzeug, und deshalb braucht
 *    es hier keinen eigenen Suchindex und keine Einbettungen.
 *
 * 3. **Der Verlauf wird mitgeschickt.** Ein einmaliger Aufruf hat kein
 *    Gedächtnis, und Sitzungskennungen sind bei jedem Werkzeug anders. Der
 *    bisherige Verlauf steht deshalb im Text — werkzeugunabhängig, zum Preis
 *    einer längeren Frage.
 */

export type ChatRole = "frage" | "antwort";

export type ChatMessage = { role: ChatRole; text: string };

/** Mehr Verlauf ist selten nützlich und macht jede Frage teurer. */
const MAX_HISTORY = 12;
/** Grenze je Nachricht — schützt vor einem eingefügten Buch. */
const MAX_CHARS = 8_000;
/** Nach dieser Zeit ohne Ende wird abgebrochen. */
const TIMEOUT_MS = 180_000;

/**
 * Die Anweisung, die vor jeder Frage steht.
 *
 * Sie ist kurz gehalten: die ausführlichen Regeln stehen in der Bibliothek,
 * und ein Werkzeug mit Dateizugriff liest sie dort. Wichtig sind die zwei
 * Dinge, die ein Chat falsch machen kann — erfinden und schreiben.
 */
function systemPrompt(web: boolean): string {
  const zeilen = [
    "Du beantwortest Fragen zu einer Mediathek: selbst aufgenommene Videos,",
    "Sprachmemos und Textnotizen. Der aktuelle Ordner IST diese Bibliothek.",
    "",
    "Quellen sind die Dateien hier:",
    "- medien/<slug>/beitrag.md — Titel, Beschreibung, Kapitel, Zusammenfassung",
    "- medien/<slug>/transcript.json — das Gesprochene, mit Zeitmarken",
    "- themen/*.md und sammlungen/*.md — Wissensgebiete und Wege",
    "- fragen/*.md — schon beantwortete Fragen. Sieh zuerst dort nach.",
    "",
    "Regeln:",
    "1. ERFINDE NICHTS. Was hier nicht steht, weißt du nicht — sage das dann.",
    "2. SCHREIBE NICHTS. Dies ist ein Gespräch, keine Bearbeitung. Lege keine",
    "   Datei an, ändere keine, führe keinen Befehl aus, der etwas verändert.",
    "3. BELEGE ALS VERWEIS. Schreibe jeden Beleg als [[kennung#mm:ss]] mitten",
    "   in den Satz — die Kennung ist der Ordnername unter medien/, die Zeit",
    "   der Anfang der Stelle im Transkript. Beispiel: „Der Zeitstempel",
    "   beginnt nicht bei null [[cloud-compare-1#04:25]].“ Ohne Zeitmarke",
    "   (Textbeitrag) genügt [[kennung]], für einen Abschnitt",
    "   [[kennung#abschnitts-anker]]. Schreibe KEINE erfundene Kennung und",
    "   keine erfundene Zeit: beides wird angeklickt.",
    "4. Antworte auf Deutsch, knapp, ohne Einleitungsfloskeln.",
  ];

  /*
   * Der Internet-Zusatz steht bewusst weit unten und trennt scharf: sonst
   * verschwimmt, was aus dem eigenen Material stammt und was von irgendwo.
   * Dieselbe Festlegung wie bei der Suche, wo ein über Synonyme erweiterter
   * Treffer als solcher gekennzeichnet wird — eine stille Vermischung wäre
   * schlimmer als gar keine Erweiterung.
   */
  if (web) {
    zeilen.push(
      "",
      "Für diese Frage darfst du zusätzlich das Internet lesen. Dabei gilt:",
      "5. ZUERST die Bibliothek. Das Internet ergänzt, es ersetzt nicht.",
      "6. TRENNE die Herkunft. Was aus dem Netz stammt, beginnt mit „Aus dem",
      "   Netz:“ und nennt die vollständige Adresse (https://…) im Text.",
      "   Was aus der Bibliothek stammt, trägt seinen [[kennung#mm:ss]]-Verweis.",
      "7. Sage ausdrücklich, wenn die Bibliothek dazu nichts hergibt.",
    );
  }

  return zeilen.join("\n");
}

/** Verlauf und Frage zu einem Text. */
export function buildChatPrompt(
  messages: readonly ChatMessage[],
  options: { web?: boolean } = {},
): string {
  const zuletzt = messages.slice(-MAX_HISTORY);
  const teile = [systemPrompt(options.web === true), ""];

  if (zuletzt.length > 1) {
    teile.push("Bisheriges Gespräch:", "");
    for (const message of zuletzt.slice(0, -1)) {
      const wer = message.role === "frage" ? "Frage" : "Antwort";
      teile.push(`${wer}: ${message.text.slice(0, MAX_CHARS)}`, "");
    }
  }

  const letzte = zuletzt.at(-1);
  teile.push("Neue Frage:", (letzte?.text ?? "").slice(0, MAX_CHARS));
  return teile.join("\n");
}

export type ChatStart =
  | { ok: true; stream: ReadableStream<Uint8Array> }
  | { ok: false; error: string };

/**
 * Startet einen Chatdurchgang und liefert die Ausgabe als Strom.
 *
 * Strom und nicht "warten und dann antworten": ein Werkzeug, das erst in den
 * Dateien sucht, braucht schnell eine halbe Minute. Ohne Strom sähe der
 * Nutzer so lange nichts und hielte es für kaputt.
 */
export async function startChat(
  messages: readonly ChatMessage[],
  options: { web?: boolean } = {},
): Promise<ChatStart> {
  const settings = await readSettings();
  if (!settings.chatEnabled) {
    return {
      ok: false,
      error: "Der Chat ist nicht eingeschaltet. Siehe Einstellungen.",
    };
  }
  if (messages.length === 0) {
    return { ok: false, error: "Ohne Frage gibt es keine Antwort." };
  }

  /*
   * Das Internet wird zweimal freigegeben: hier durch die Einstellung, und
   * an der Frage durch den Schalter. Fehlt eines von beidem, bleibt es beim
   * eigenen Bestand — und der Auftragstext erwähnt es dann gar nicht erst.
   */
  const web = options.web === true && settings.chatWebAllowed;
  const prompt = buildChatPrompt(messages, { web });
  const args = web
    ? [...settings.chatArgs, ...settings.chatWebArgs]
    : [...settings.chatArgs];

  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(settings.assistantCommand, args, {
      cwd: paths.library,
      // Kein shell: true, keine PowerShell. Die Frage geht über stdin.
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch (error) {
    return {
      ok: false,
      error: `„${settings.assistantCommand}" ließ sich nicht starten: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let beendet = false;
      let kamEtwas = false;
      let fehlertext = "";

      const schliessen = (nachtrag?: string) => {
        if (beendet) return;
        beendet = true;
        clearTimeout(timer);
        if (nachtrag) controller.enqueue(encoder.encode(nachtrag));
        controller.close();
      };

      const timer = setTimeout(() => {
        child.kill();
        schliessen(
          "\n\n[Abgebrochen: Das Werkzeug hat drei Minuten lang nicht " +
            "geantwortet.]",
        );
      }, TIMEOUT_MS);

      child.stdout?.on("data", (chunk: Buffer) => {
        kamEtwas = true;
        controller.enqueue(new Uint8Array(chunk));
      });

      /*
       * stderr wird gesammelt, nicht durchgereicht: dort steht bei den
       * meisten Werkzeugen Fortschrittsgeplapper. Interessant wird es nur,
       * wenn am Ende gar keine Antwort kam.
       */
      child.stderr?.on("data", (chunk: Buffer) => {
        fehlertext += chunk.toString("utf8");
      });

      child.on("error", (error) => {
        schliessen(`\n\n[Fehler: ${error.message}]`);
      });

      child.on("close", (code) => {
        if (kamEtwas) {
          schliessen();
          return;
        }
        const meldung = fehlertext.trim().split("\n").slice(0, 3).join(" ");
        schliessen(
          `[Keine Antwort. „${settings.assistantCommand} ` +
            `${args.join(" ")}" endete mit ${code}` +
            (meldung ? `: ${meldung}` : ".") +
            "]\n\nStimmen Programm und Argumente unter Einstellungen? " +
            "Für einen einmaligen Aufruf braucht claude „-p“, codex „exec“.",
        );
      });

      // Die Frage hinein, dann zu — sonst wartet das Werkzeug auf mehr.
      child.stdin?.end(prompt, "utf8");
    },

    cancel() {
      // Der Browser hat abgebrochen: den Prozess nicht weiterlaufen lassen.
      child.kill();
    },
  });

  return { ok: true, stream };
}
