import "server-only";

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { libraryStateDir } from "@/lib/settings";
import type { Job, JobErrorCode, JobKind, JobSnapshot } from "./types";
import { isFinished } from "./types";

/*
 * Eine kleine, serielle Auftragsschlange.
 *
 * Kein Redis, keine Datenbank, keine Bibliothek: eine Maschine, ein Nutzer,
 * ein gleichzeitiger Lauf. Rund zweihundert Zeilen eigener Code sind hier
 * billiger als eine Abhängigkeit — und die Grafikkarte verträgt ohnehin nur
 * einen Whisper-Lauf zugleich.
 */

/** Was ein Auftrag melden kann, während er läuft. */
export type JobContext = {
  job: Job;
  /** Fortschritt melden. `progress` wird monoton geklemmt. */
  update(fields: Partial<Omit<Job, "id" | "kind" | "slug">>): void;
  /** Prozesskennung eintragen, damit ein Abbruch greifen kann. */
  setPid(pid: number | null): void;
  /** Eine Zeile ins Protokoll. */
  log(line: string): void;
  /** true, sobald ein Abbruch verlangt wurde. */
  isCanceled(): boolean;
};

export type JobRunner = (context: JobContext) => Promise<void>;

export class JobError extends Error {
  code: JobErrorCode;
  detail?: string;

  constructor(code: JobErrorCode, message: string, detail?: string) {
    super(message);
    this.name = "JobError";
    this.code = code;
    this.detail = detail;
  }
}

type Listener = (snapshot: JobSnapshot) => void;

/** Wie viele abgeschlossene Aufträge im Verlauf bleiben. */
const KEEP_FINISHED = 50;
/** Wie oft der Zustand höchstens auf die Platte geht. */
const PERSIST_DEBOUNCE_MS = 250;

class JobQueue {
  #jobs = new Map<string, Job>();
  #order: string[] = [];
  #running: Job | null = null;
  #canceled = new Set<string>();
  #runners = new Map<JobKind, JobRunner>();
  #listeners = new Set<Listener>();
  #persistTimer: NodeJS.Timeout | null = null;
  #stateDir: string;
  #loaded = false;

  constructor(stateDir: string) {
    this.#stateDir = stateDir;
  }

  register(kind: JobKind, runner: JobRunner): void {
    this.#runners.set(kind, runner);
  }

  // ───────────────────────────────────────────────────────── Zustand lesen

  snapshot(): JobSnapshot {
    return {
      jobs: this.#order
        .map((id) => this.#jobs.get(id))
        .filter((job): job is Job => job !== undefined),
      runningId: this.#running?.id ?? null,
    };
  }

  jobsFor(slug: string): Job[] {
    return this.snapshot().jobs.filter((job) => job.slug === slug);
  }

  /** Läuft oder wartet für diesen Beitrag schon etwas dieser Art? */
  activeFor(slug: string, kind: JobKind): Job | null {
    return (
      this.snapshot().jobs.find(
        (job) => job.slug === slug && job.kind === kind && !isFinished(job.state),
      ) ?? null
    );
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #notify(): void {
    const snapshot = this.snapshot();
    for (const listener of this.#listeners) {
      try {
        listener(snapshot);
      } catch {
        // Ein hängender Zuhörer darf den Lauf nicht aufhalten.
      }
    }
    this.#schedulePersist();
  }

  // ─────────────────────────────────────────────────────── Zustand ablegen

  /*
   * Maschinenlokal, ausdrücklich NICHT in der Bibliothek. Drei Gründe: die
   * Bibliothek liegt womöglich auf einem Netzlaufwerk und wird
   * herumkopiert; sie ist das Artefakt, das man Kollegen gibt — eine Datei
   * mit lokalen Prozesskennungen hat dort nichts zu suchen; und häufige
   * kleine Schreibvorgänge über SMB, während ein zweiter Betrachter mitliest,
   * ergeben irgendwann kaputtes JSON.
   */
  #jobsFile(): string {
    return path.join(this.#stateDir, "jobs.json");
  }

  #schedulePersist(): void {
    if (this.#persistTimer) return;
    // Ein 90-Minuten-Lauf meldet tausende Fortschritte — die dürfen nicht
    // tausend Schreibvorgänge werden.
    this.#persistTimer = setTimeout(() => {
      this.#persistTimer = null;
      void this.#persist();
    }, PERSIST_DEBOUNCE_MS);
    this.#persistTimer.unref?.();
  }

  async #persist(): Promise<void> {
    const file = this.#jobsFile();
    const temporary = `${file}.tmp`;
    try {
      await fs.mkdir(this.#stateDir, { recursive: true });
      /*
       * `progress` wird bewusst nicht dauerhaft gemerkt: nach einem Neustart
       * gibt es keinen laufenden Prozess mehr, dessen Fortschritt gelten
       * könnte. Nur Zustandsübergänge zählen.
       */
      const payload = {
        version: 1,
        jobs: this.snapshot().jobs.map((job) => ({
          ...job,
          pid: null,
        })),
      };
      await fs.writeFile(temporary, JSON.stringify(payload), "utf8");
      await fs.rename(temporary, file);
    } catch {
      await fs.rm(temporary, { force: true }).catch(() => {});
    }
  }

  /**
   * Liest den letzten Zustand ein und richtet ihn gerade.
   *
   * Ein Auftrag, der als "läuft" gespeichert war, kann nicht laufen — nur
   * dieser Prozess startet Aufträge, und er startet gerade. Er wird auf
   * "fehler" gesetzt, mit einem Knopf zum Wiederholen.
   *
   * Eine gespeicherte Prozesskennung wird NIEMALS blind getötet: sie kann
   * inzwischen einem unbeteiligten Programm gehören.
   */
  async load(): Promise<void> {
    if (this.#loaded) return;
    this.#loaded = true;
    try {
      const raw = await fs.readFile(this.#jobsFile(), "utf8");
      const parsed = JSON.parse(raw) as { version?: number; jobs?: Job[] };
      if (parsed.version !== 1 || !Array.isArray(parsed.jobs)) return;

      for (const stored of parsed.jobs) {
        const job: Job = { ...stored, pid: null };
        if (!isFinished(job.state)) {
          job.state = "fehler";
          job.finishedAt = new Date().toISOString();
          job.error = {
            code: "server_neu_gestartet",
            message:
              "Der Server wurde während der Verarbeitung beendet. Der Lauf " +
              "kann neu gestartet werden.",
          };
          job.message = "Abgebrochen, weil der Server beendet wurde.";
        }
        this.#jobs.set(job.id, job);
        this.#order.push(job.id);
      }
      this.#trim();
    } catch {
      // Keine Datei, kaputtes JSON: dann eben ohne Verlauf.
    }
  }

  #trim(): void {
    const finished = this.#order.filter((id) => {
      const job = this.#jobs.get(id);
      return job && isFinished(job.state);
    });
    if (finished.length <= KEEP_FINISHED) return;
    for (const id of finished.slice(0, finished.length - KEEP_FINISHED)) {
      this.#jobs.delete(id);
      this.#order = this.#order.filter((entry) => entry !== id);
    }
  }

  // ───────────────────────────────────────────────────────── Anstellen

  enqueue(input: {
    kind: JobKind;
    slug: string;
    title: string;
    /** Beliebige Angaben für den Runner. */
    payload?: Record<string, unknown>;
  }): Job {
    const id = `${Date.now().toString(36)}${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const job: Job = {
      id,
      kind: input.kind,
      slug: input.slug,
      title: input.title,
      state: "wartet",
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      progress: 0,
      stage: "warten",
      message: "Wartet …",
      etaSec: null,
      speed: null,
      deviceUsed: null,
      fallbackReason: null,
      pid: null,
      attempt: 1,
      error: null,
      logFile: path.join(this.#stateDir, "logs", `${id}.log`),
    };
    // Der Runner bekommt seine Angaben über eine Nebenkarte, damit `Job`
    // nur enthält, was die Anzeige braucht.
    this.#payloads.set(id, input.payload ?? {});
    this.#jobs.set(id, job);
    this.#order.push(id);
    this.#notify();
    void this.#pump();
    return job;
  }

  #payloads = new Map<string, Record<string, unknown>>();

  payloadOf(id: string): Record<string, unknown> {
    return this.#payloads.get(id) ?? {};
  }

  // ───────────────────────────────────────────────────────── Abarbeiten

  async #pump(): Promise<void> {
    /*
     * Ein Prozess, ein Event-Loop: diese Prüfung genügt, SOLANGE
     * `this.#running` synchron vor dem ersten await gesetzt wird.
     */
    if (this.#running) return;
    const next = this.#order
      .map((id) => this.#jobs.get(id))
      .find((job): job is Job => job !== undefined && job.state === "wartet");
    if (!next) return;

    if (this.#canceled.has(next.id)) {
      this.#finish(next, "abgebrochen", "Abgebrochen, bevor der Lauf begann.");
      void this.#pump();
      return;
    }

    this.#running = next;
    next.state = "laeuft";
    next.startedAt = new Date().toISOString();
    next.message = "Wird vorbereitet …";
    this.#notify();

    const runner = this.#runners.get(next.kind);
    if (!runner) {
      this.#finish(next, "fehler", "Für diese Art gibt es keinen Ablauf.", {
        code: "internal",
        message: `Kein Ablauf für "${next.kind}" hinterlegt.`,
      });
      this.#running = null;
      void this.#pump();
      return;
    }

    const context = this.#makeContext(next);
    try {
      await runner(context);
      if (this.#canceled.has(next.id)) {
        this.#finish(next, "abgebrochen", "Abgebrochen.");
      } else {
        this.#finish(next, "fertig", next.message || "Fertig.");
      }
    } catch (error) {
      if (this.#canceled.has(next.id)) {
        this.#finish(next, "abgebrochen", "Abgebrochen.");
      } else if (error instanceof JobError) {
        this.#finish(next, "fehler", error.message, {
          code: error.code,
          message: error.message,
          detail: error.detail,
        });
      } else {
        const message =
          error instanceof Error ? error.message : String(error);
        this.#finish(next, "fehler", "Unerwarteter Fehler.", {
          code: "internal",
          message,
        });
      }
    } finally {
      this.#canceled.delete(next.id);
      this.#payloads.delete(next.id);
      this.#running = null;
      this.#trim();
      this.#notify();
      void this.#pump();
    }
  }

  #makeContext(job: Job): JobContext {
    const appendLog = (line: string) => {
      if (!job.logFile) return;
      void fs
        .mkdir(path.dirname(job.logFile), { recursive: true })
        .then(() =>
          fs.appendFile(
            job.logFile!,
            `${new Date().toISOString()} ${line}\n`,
            "utf8",
          ),
        )
        .catch(() => {});
    };

    return {
      job,
      update: (fields) => {
        if (fields.progress !== undefined) {
          // Monoton: ein Rückschritt im Balken sieht nach Fehler aus.
          job.progress = Math.min(1, Math.max(job.progress, fields.progress));
        }
        for (const [key, value] of Object.entries(fields)) {
          if (key === "progress") continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (job as any)[key] = value;
        }
        this.#notify();
      },
      setPid: (pid) => {
        job.pid = pid;
        this.#notify();
      },
      log: appendLog,
      isCanceled: () => this.#canceled.has(job.id),
    };
  }

  #finish(
    job: Job,
    state: Job["state"],
    message: string,
    error?: Job["error"],
  ): void {
    job.state = state;
    job.finishedAt = new Date().toISOString();
    job.message = message;
    job.pid = null;
    job.etaSec = null;
    if (state === "fertig") job.progress = 1;
    if (error) job.error = error;
    this.#notify();
  }

  // ───────────────────────────────────────────────────────── Abbrechen

  /**
   * Bricht einen Auftrag ab.
   *
   * `taskkill /T` ist Pflicht, nicht Zierde: nur python.exe zu beenden
   * ließe das von ihm gestartete ffmpeg.exe weiterlaufen — mit einem
   * offenen Handle auf die Bibliothek. Zusätzlich hängt die Python-Seite
   * ihre Kinder an ein Win32-Job-Objekt, das beim Sterben des Elternteils
   * aufräumt (tools/procutil.py).
   */
  cancel(id: string): boolean {
    const job = this.#jobs.get(id);
    if (!job || isFinished(job.state)) return false;

    this.#canceled.add(id);
    job.message = "Wird abgebrochen …";
    this.#notify();

    if (job.pid) {
      if (process.platform === "win32") {
        spawn("taskkill", ["/PID", String(job.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      } else {
        try {
          process.kill(-job.pid, "SIGTERM");
        } catch {
          try {
            process.kill(job.pid, "SIGTERM");
          } catch {
            // Schon beendet.
          }
        }
      }
    }
    return true;
  }

  /** Beim geordneten Herunterfahren: laufenden Auftrag beenden, Zustand sichern. */
  async shutdown(): Promise<void> {
    if (this.#running) this.cancel(this.#running.id);
    if (this.#persistTimer) {
      clearTimeout(this.#persistTimer);
      this.#persistTimer = null;
    }
    await this.#persist();
  }
}

/*
 * Ein Singleton auf globalThis, und zwar IMMER — nicht nur im
 * Entwicklungsbetrieb. Next wirft im Dev-Modus Route-Module weg und lädt sie
 * neu; ein `new JobQueue()` auf Modulebene ergäbe eine zweite Schlange und
 * damit einen zweiten Whisper-Lauf auf derselben Grafikkarte.
 */
const globalForJobs = globalThis as unknown as {
  mediathekQueue?: JobQueue;
  mediathekQueueHooked?: boolean;
};

export function getQueue(): JobQueue {
  if (!globalForJobs.mediathekQueue) {
    globalForJobs.mediathekQueue = new JobQueue(libraryStateDir());
  }
  if (!globalForJobs.mediathekQueueHooked) {
    globalForJobs.mediathekQueueHooked = true;
    // SIGBREAK deckt Strg+Untbr im cmd-Fenster ab.
    for (const signal of ["SIGINT", "SIGTERM", "SIGBREAK"] as const) {
      process.once(signal, () => {
        void globalForJobs.mediathekQueue
          ?.shutdown()
          .finally(() => process.exit(0));
      });
    }
  }
  return globalForJobs.mediathekQueue;
}

/**
 * Wirft die Schlange weg. NUR beim Wechsel der Bibliothek: der Zustand liegt
 * je Bibliothek in einem eigenen Ordner, und die Schlange merkt sich diesen
 * Ordner bei ihrer Erzeugung. Ohne das Wegwerfen schriebe sie den Verlauf der
 * alten Bibliothek in den Zustandsordner der neuen.
 *
 * Der Aufrufer stellt sicher, dass gerade kein Auftrag läuft.
 */
export function resetQueue(): void {
  globalForJobs.mediathekQueue = undefined;
}

export type { JobQueue };
