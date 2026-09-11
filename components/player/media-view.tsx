"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  LocalMediaStorage,
  MediaPlayer,
  MediaProvider,
  Poster,
  Track,
} from "@vidstack/react";
import type { MediaPlayerInstance, Src } from "@vidstack/react";
import {
  DefaultAudioLayout,
  DefaultVideoLayout,
  defaultLayoutIcons,
} from "@vidstack/react/player/layouts/default";

import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/audio.css";
import "@vidstack/react/player/styles/default/layouts/video.css";

import { chaptersToVtt } from "@/lib/library/chapters";
import type { Chapter, MediaKind } from "@/lib/library/types";
import { shouldRemember, writeProgress } from "@/lib/watch-progress";
import { usePlayerStore } from "./player-store";
import { PLAYER_TRANSLATIONS } from "./translations";

/*
 * DIE EINZIGE DATEI, DIE @vidstack/react IMPORTIERT.
 *
 * Alles andere spricht über den Player-Store. Wird der Player je
 * ausgetauscht, ist genau diese Datei betroffen.
 *
 * Das Standard-Layout bringt die segmentierte Zeitleiste, das Kapitelmenü,
 * Tastenkürzel und die ARIA-Rollen schon mit — genau die Randfälle
 * (Pointer-Capture beim Ziehen, Vollbild, Touch, Fokus), die man selbst
 * gebaut erst in Stufe drei bemerkt.
 */

/** Wie oft die Zeit an den Store gemeldet wird. */
const PUBLISH_INTERVAL_MS = 250;
/** Wie oft die Position im Browser gespeichert wird. */
const PROGRESS_INTERVAL_MS = 5_000;

/**
 * Die MIME-Typen, die vidstack in seinen Typen zulässt. Die Laufzeit kennt
 * mehr (etwa audio/mp4), die Typdeklaration aber nicht.
 *
 * Alles andere wird bewusst OHNE Typangabe übergeben: vidstack erkennt die
 * Art dann an der Endung der Adresse, und unsere Medien-Adressen behalten die
 * echte Endung. Das deckt .m4a, .wav, .aac und .mov ab — genau die Formate,
 * in denen Sprachmemos und Handyaufnahmen ankommen.
 */
const PLAYER_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/mpeg",
  "audio/mpeg",
  "audio/ogg",
  "audio/webm",
  "audio/flac",
]);

type PlayerMimeType =
  | "video/mp4"
  | "video/webm"
  | "video/ogg"
  | "video/mpeg"
  | "audio/mpeg"
  | "audio/ogg"
  | "audio/webm"
  | "audio/flac";

function toPlayerType(mime: string | null): PlayerMimeType | undefined {
  if (mime && PLAYER_MIME_TYPES.has(mime)) return mime as PlayerMimeType;
  return undefined;
}

/**
 * Der Speicher des Players — mit einer Ausnahme.
 *
 * vidstack merkt sich Lautstärke, Ton, Geschwindigkeit und die zuletzt
 * gesehene Stelle im localStorage und stellt das alles beim Ereignis
 * „can-play" wieder her. Das passiert NACH `loadedmetadata` und damit nach
 * unserem Sprung aus `?t=`: der Player landete richtig bei 12:40 und wurde
 * einen Wimpernschlag später dorthin zurückgeworfen, wo man das letzte Mal
 * aufgehört hatte. Nur bei schon gesehenen Beiträgen — daher das „manchmal"
 * in der Fehlerbeschreibung, und daher war es beim Ausprobieren so schwer zu
 * fassen.
 *
 * Eine Zeit in der Adresse ist eine Ansage: sie schlägt die gemerkte Stelle.
 * Deshalb verschweigt dieser Speicher dann die Zeit — alles andere gibt er
 * weiter heraus, und gespeichert wird auch weiterhin.
 */
class PlayerStorage extends LocalMediaStorage {
  readonly #key: string;
  /** Wahr, solange die Adresse selbst eine Zeit nennt. */
  readonly #ignoreStoredTime: boolean;

  constructor(key: string, ignoreStoredTime: boolean) {
    super();
    this.#key = key;
    this.#ignoreStoredTime = ignoreStoredTime;
  }

  override async getTime(): Promise<number | null> {
    return this.#ignoreStoredTime ? null : super.getTime();
  }

  override onChange(src: Src, mediaId: string | null): void {
    /*
     * Als Zeichenkette übergeben wäre der Wert selbst der Schlüssel für
     * Lautstärke und Co. gewesen; als Objekt übergeben müssen wir ihn selbst
     * nennen, sonst landet alles unter dem gemeinsamen Schlüssel
     * „vds-player" und die Einstellungen eines Beitrags gälten für alle.
     */
    super.onChange(src, mediaId, this.#key);
  }
}

export function MediaView({
  slug,
  title,
  kind,
  src,
  mimeType,
  poster,
  chapters,
  durationSeconds,
  startAt,
  stopAt,
}: {
  slug: string;
  title: string;
  kind: Exclude<MediaKind, "text">;
  src: string;
  mimeType: string | null;
  poster: string | null;
  chapters: Chapter[];
  durationSeconds: number | null;
  /** Sprungziel aus ?t= oder aus der gemerkten Position. */
  startAt: number | null;
  /** Ende eines Ausschnitts aus ?bis= — dort wird angehalten. */
  stopAt: number | null;
}) {
  const store = usePlayerStore();
  const player = useRef<MediaPlayerInstance>(null);
  const lastPublished = useRef(0);
  const lastSaved = useRef(0);
  const [failed, setFailed] = useState<string | null>(null);
  const playerType = toPlayerType(mimeType);

  /*
   * Die Kapitel kommen aus beitrag.md, nicht aus einer Datei: der Parser
   * erzeugt den WebVTT-Text, und der wird dem Track direkt übergeben.
   *
   * Bewusst KEINE Blob-Adresse: die müsste wieder freigegeben werden, und im
   * Strict Mode laufen Effekte doppelt (mounten, abbauen, mounten). Die
   * Adresse wäre nach dem ersten Abbau ungültig, und die Zeitleiste bliebe
   * ohne Kapitel — mit einem ERR_FILE_NOT_FOUND, das nach einem
   * Netzwerkfehler aussieht. So gibt es weiterhin genau eine Wahrheit und
   * zusätzlich keinen Ladevorgang.
   */
  const chaptersVtt = useMemo(() => {
    const timed = chapters.filter(
      (chapter) => chapter.kind === "zeit" && !chapter.beyondEnd,
    );
    if (timed.length === 0) return null;
    return chaptersToVtt(chapters, durationSeconds);
  }, [chapters, durationSeconds]);

  /*
   * Das Sprungziel wird angemeldet, nicht gesetzt: der Store merkt sich es,
   * solange die Metadaten fehlen, und fuehrt es aus, sobald sie da sind.
   */
  useEffect(() => {
    if (startAt !== null && startAt > 0) store?.seekTo(startAt);
  }, [store, startAt]);

  /*
   * Und die gemerkte Stelle darf dem Sprungziel nicht in den Rücken fallen.
   * Die Entscheidung steckt im Speicher selbst, nicht in einem Schalter
   * daran: so gibt es keinen Augenblick, in dem der Player schon liest und
   * die Antwort noch nicht steht.
   */
  const storage = useMemo(
    () =>
      new PlayerStorage(`mediathek:${slug}`, startAt !== null && startAt > 0),
    [slug, startAt],
  );

  // Das Ende des Ausschnitts ist eine Einstellung des Stores, kein Zustand.
  useEffect(() => {
    store?.setStopAt(stopAt);
    return () => store?.setStopAt(null);
  }, [store, stopAt]);

  // Den Store mit dem Player verbinden.
  useEffect(() => {
    if (!store) return;
    const instance = player.current;
    if (!instance) return;
    return store.attach({
      seek: (seconds) => {
        instance.currentTime = seconds;
      },
      play: () => void instance.play().catch(() => {}),
      pause: () => void instance.pause(),
    });
  }, [store]);

  return (
    <div className="overflow-hidden rounded-xl border border-rand bg-black">
      <MediaPlayer
        ref={player}
        className="w-full"
        title={title}
        src={playerType ? { src, type: playerType } : src}
        viewType={kind === "audio" ? "audio" : "video"}
        playsInline
        crossOrigin={null}
        /*
         * "eager": auf der Beitragsseite steht genau ein Player, und wer sie
         * öffnet, will ihn abspielen. Sparsam bleibt es trotzdem, weil das
         * Element mit preload="metadata" nur den Anfang holt statt die ganze
         * Datei vom Netzlaufwerk zu ziehen.
         *
         * Zu wissen: vidstack startet bei "eager" über
         * requestAnimationFrame. In einem Tab im Hintergrund läuft das nicht
         * — der Player bleibt dann leer, bis der Tab nach vorn kommt. Das
         * ist gewollt (kein Netzzugriff für unsichtbare Tabs), sieht beim
         * Suchen nach Fehlern aber wie ein defekter Player aus.
         */
        load="eager"
        posterLoad="eager"
        storage={storage}
        onLoadedMetadata={() => {
          const instance = player.current;
          if (!instance) return;
          /*
           * Ab hier darf gesprungen werden. Der Store holt ein Sprungziel,
           * das vorher verlangt wurde, jetzt nach — vorher verwirft der
           * Browser currentTime still, der klassische Fehler bei
           * Sprungzielen aus der Adresse.
           */
          store?.publish({
            duration: instance.state.duration,
            ready: true,
          });
        }}
        onTimeUpdate={({ currentTime }) => {
          // Ungedrosselt: ein Ausschnitt soll auf die Zehntelsekunde enden.
          store?.checkStop(currentTime);
          const now = performance.now();
          if (now - lastPublished.current >= PUBLISH_INTERVAL_MS) {
            lastPublished.current = now;
            store?.publish({ currentTime });
          }
          if (now - lastSaved.current >= PROGRESS_INTERVAL_MS) {
            lastSaved.current = now;
            saveProgress(slug, currentTime, player.current);
          }
        }}
        onPause={() => {
          store?.publish({ paused: true });
          const instance = player.current;
          if (instance) {
            saveProgress(slug, instance.state.currentTime, instance);
          }
        }}
        onPlay={() => store?.publish({ paused: false })}
        onEnded={() => {
          const instance = player.current;
          if (instance) {
            saveProgress(slug, instance.state.currentTime, instance);
          }
        }}
        onError={(detail) => {
          /*
           * Der Fall, der beim Kollegen wirklich auftritt: H.265/HEVC aus
           * Handy oder Drohne. Serverseitig ist das beim Import schon
           * gemeldet, aber die Meldung hier ist die, die hilft.
           */
          setFailed(
            detail?.message ?? "Die Datei konnte nicht abgespielt werden.",
          );
        }}
      >
        <MediaProvider>
          {poster ? (
            <Poster className="vds-poster" src={poster} alt="" />
          ) : null}
          {chaptersVtt ? (
            <Track
              kind="chapters"
              content={chaptersVtt}
              language="de"
              type="vtt"
              label="Kapitel"
              default
            />
          ) : null}
        </MediaProvider>

        {kind === "audio" ? (
          <DefaultAudioLayout
            icons={defaultLayoutIcons}
            translations={PLAYER_TRANSLATIONS}
          />
        ) : (
          <DefaultVideoLayout
            icons={defaultLayoutIcons}
            translations={PLAYER_TRANSLATIONS}
          />
        )}
      </MediaPlayer>

      {failed ? (
        <p className="border-t border-rand bg-warnung-grund p-3 text-sm text-warnung">
          {failed} Häufigste Ursache: das Video ist in H.265/HEVC kodiert, das
          Chrome und Edge nicht ohne Zusatz abspielen. Eine Web-Fassung in H.264
          schafft Abhilfe.
        </p>
      ) : null}
    </div>
  );
}

/** Nur merken, was zu merken sich lohnt — die Regeln stehen in lib/watch-progress. */
function saveProgress(
  slug: string,
  position: number,
  instance: MediaPlayerInstance | null,
) {
  const duration = instance?.state.duration ?? null;
  const usable = duration && Number.isFinite(duration) ? duration : null;
  if (!shouldRemember(position, usable)) return;
  writeProgress({
    slug,
    position,
    durationSeconds: usable,
    updatedAtMs: Date.now(),
  });
}
