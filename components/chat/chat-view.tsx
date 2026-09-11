"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  CornerDownRight,
  Globe,
  Send,
  Square,
  Trash2,
  User,
} from "lucide-react";

import { saveQuestionAction } from "@/app/fragen/actions";
import { AntwortText } from "@/components/fragen/antwort-text";
import { Button, Leer } from "@/components/ui/basis";
import type { ChatMessage } from "@/lib/assistant/chat";
import { cn } from "@/lib/utils";

/*
 * Das Gespräch über die Bibliothek.
 *
 * Die Antwort kommt als Strom herein und wird Stück für Stück angezeigt —
 * ein Werkzeug, das erst in den Transkripten sucht, braucht schnell eine
 * halbe Minute, und so lange ein leeres Feld anzusehen fühlt sich an, als
 * wäre etwas kaputt.
 *
 * ES IST EIN GESPRÄCH, keine Reihe von Einzelfragen: der bisherige Verlauf
 * geht bei jeder Frage mit, eine Nachfrage weiß also, worum es ging. Das war
 * schon so, sah aber nicht so aus — deshalb steht unter jeder Antwort jetzt
 * ausdrücklich, dass man nachhaken kann.
 *
 * Der Verlauf lebt nur im Browser und nur in dieser Sitzung. Was bleibt, sind
 * die einzelnen Fragen: jede fertige Antwort wandert als Datei nach fragen/.
 */

type Eintrag = ChatMessage & {
  /** Bei Antworten: die Kennung der abgelegten Datei, sobald sie da ist. */
  slug?: string;
  /** Bei Antworten: wurde für sie auch das Netz gelesen? */
  web?: boolean;
};

/** Die Nachfrage hinter dem Knopf „Im Internet weiterrecherchieren". */
const WEB_FOLLOWUP =
  "Recherchiere dazu zusätzlich im Internet. Sag ausdrücklich, was aus dem " +
  "Netz stammt, und nenne die Adressen.";

export function ChatView({
  tool,
  titles,
  webAllowed,
  initialMessages = [],
}: {
  tool: string;
  /** Kennung → Titel, damit Belege lesbar beschriftet werden. */
  titles: Readonly<Record<string, string>>;
  /** Ob der Internet-Schalter überhaupt angeboten wird. */
  webAllowed: boolean;
  /**
   * Ein mitgebrachter Verlauf — wenn das Gespräch von einer abgelegten Frage
   * aus weitergeht. So beginnt eine Nachfrage nicht bei null.
   */
  initialMessages?: ChatMessage[];
}) {
  const [messages, setMessages] = useState<Eintrag[]>(initialMessages);
  const [frage, setFrage] = useState("");
  const [web, setWeb] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const abbruch = useRef<AbortController | null>(null);
  const ende = useRef<HTMLDivElement>(null);
  const feld = useRef<HTMLTextAreaElement>(null);

  const senden = async (
    text: string,
    optionen: { web?: boolean } = {},
  ): Promise<void> => {
    const gefragt = text.trim();
    if (!gefragt || laeuft) return;

    const mitNetz = webAllowed && (optionen.web ?? web);
    setFehler(null);
    setFrage("");
    const verlauf: Eintrag[] = [...messages, { role: "frage", text: gefragt }];
    setMessages([...verlauf, { role: "antwort", text: "", web: mitNetz }]);
    setLaeuft(true);

    const controller = new AbortController();
    abbruch.current = controller;

    try {
      const antwort = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: verlauf.map(({ role, text: inhalt }) => ({
            role,
            text: inhalt,
          })),
          web: mitNetz,
        }),
        signal: controller.signal,
      });

      if (!antwort.ok || !antwort.body) {
        const daten = (await antwort.json().catch(() => null)) as {
          error?: string;
        } | null;
        setFehler(daten?.error ?? "Der Chat hat nicht geantwortet.");
        setMessages(verlauf);
        return;
      }

      const leser = antwort.body.getReader();
      const decoder = new TextDecoder();
      let gesammelt = "";

      for (;;) {
        const { done, value } = await leser.read();
        if (done) break;
        gesammelt += decoder.decode(value, { stream: true });
        setMessages([
          ...verlauf,
          { role: "antwort", text: gesammelt, web: mitNetz },
        ]);
        ende.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }

      if (!gesammelt.trim()) {
        setMessages(verlauf);
        setFehler("Es kam keine Antwort zurück.");
        return;
      }

      /*
       * Jetzt erst ablegen — eine abgebrochene Antwort ist keine Antwort.
       * Scheitert das Ablegen, bleibt das Gespräch stehen: die Antwort ist ja
       * da. Gemeldet wird es trotzdem, sonst wüchse der Bestand still nicht.
       */
      const abgelegt = await saveQuestionAction({
        question: gefragt,
        answer: gesammelt,
        usedWeb: mitNetz,
      });
      setMessages([
        ...verlauf,
        {
          role: "antwort",
          text: gesammelt,
          web: mitNetz,
          slug: abgelegt.ok ? abgelegt.slug : undefined,
        },
      ]);
      if (!abgelegt.ok) {
        setFehler(`Die Frage wurde nicht abgelegt: ${abgelegt.error}`);
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setFehler(
          `Der Chat wurde unterbrochen: ${(error as Error).message ?? ""}`,
        );
      }
    } finally {
      setLaeuft(false);
      abbruch.current = null;
    }
  };

  const letzteAntwort = messages.reduce(
    (found, message, index) => (message.role === "antwort" ? index : found),
    -1,
  );

  return (
    <div className="space-y-4">
      {messages.length === 0 ? (
        <Leer titel="Frag die Mediathek">
          Zum Beispiel: <em>„Was sagt das Material über die Zellspannung?“</em>{" "}
          oder <em>„In welchen Beiträgen geht es um den Rotorschutz?“</em>{" "}
          Geantwortet wird aus den Dateien der Bibliothek — mit Beitrag und
          Zeitmarke als Beleg, zum Anklicken. Nachfragen gehen jederzeit, der
          Verlauf geht mit. Jede Antwort wird unter{" "}
          <Link href="/fragen" className="text-akzent hover:underline">
            Fragen
          </Link>{" "}
          abgelegt.
        </Leer>
      ) : (
        <ul className="space-y-3">
          {messages.map((message, index) => (
            <li
              key={index}
              className={cn(
                "rounded-xl border px-3 py-2",
                message.role === "frage"
                  ? "border-akzent/40 bg-akzent/10"
                  : "border-rand bg-grund-2",
              )}
            >
              <p className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-schrift-3">
                {message.role === "frage" ? (
                  <>
                    <User aria-hidden className="size-3" />
                    Frage
                  </>
                ) : (
                  <>
                    <Send aria-hidden className="size-3" />
                    {tool}
                    {message.web ? (
                      <span className="inline-flex items-center gap-1">
                        <Globe aria-hidden className="size-3" />
                        mit Internet
                      </span>
                    ) : null}
                    {message.slug ? (
                      <Link
                        href={`/fragen/${message.slug}`}
                        className="text-akzent hover:underline"
                      >
                        · abgelegt
                      </Link>
                    ) : null}
                  </>
                )}
              </p>

              {message.role === "antwort" ? (
                message.text ? (
                  <AntwortText text={message.text} titles={titles} />
                ) : laeuft && index === messages.length - 1 ? (
                  <p className="text-sm text-schrift-3">
                    sucht in der Bibliothek …
                  </p>
                ) : null
              ) : (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {message.text}
                </p>
              )}

              {/*
               * Unter der LETZTEN Antwort: wie es weitergeht. Genau hier fehlte
               * bisher der Hinweis, dass man nachhaken kann — und das ließ den
               * Chat aussehen wie ein Automat für Einzelfragen.
               */}
              {message.role === "antwort" &&
              message.text &&
              index === letzteAntwort &&
              !laeuft ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-rand pt-2">
                  <Button
                    size="klein"
                    variant="leise"
                    onClick={() => feld.current?.focus()}
                  >
                    <CornerDownRight aria-hidden className="size-3.5" />
                    Nachfragen
                  </Button>
                  {webAllowed && !message.web ? (
                    <Button
                      size="klein"
                      variant="leise"
                      onClick={() => void senden(WEB_FOLLOWUP, { web: true })}
                    >
                      <Globe aria-hidden className="size-3.5" />
                      Im Internet weiterrecherchieren
                    </Button>
                  ) : null}
                  <span className="text-xs text-schrift-3">
                    Der Verlauf geht mit — die nächste Frage darf sich auf diese
                    Antwort beziehen.
                  </span>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div ref={ende} />

      {fehler ? (
        <p className="rounded-lg border border-warnung/40 bg-warnung-grund px-3 py-2 text-sm text-warnung">
          {fehler}
        </p>
      ) : null}

      <div className="sticky bottom-4 space-y-2 rounded-xl border border-rand bg-grund-2 p-3">
        <textarea
          ref={feld}
          rows={2}
          value={frage}
          disabled={laeuft}
          placeholder={
            messages.length === 0
              ? "Was möchtest du wissen?"
              : "Nachfragen? Einfach weiterschreiben."
          }
          onChange={(event) => setFrage(event.target.value)}
          onKeyDown={(event) => {
            // Eingabe schickt ab, Umschalt+Eingabe macht eine neue Zeile.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void senden(frage);
            }
          }}
          className="w-full resize-none rounded-lg border border-rand bg-grund px-3 py-2 text-sm disabled:opacity-50"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primaer"
            size="klein"
            disabled={laeuft || !frage.trim()}
            onClick={() => void senden(frage)}
          >
            <Send aria-hidden className="size-3.5" />
            {messages.length === 0 ? "Fragen" : "Nachfragen"}
          </Button>
          {laeuft ? (
            <Button
              size="klein"
              variant="sekundaer"
              onClick={() => abbruch.current?.abort()}
            >
              <Square aria-hidden className="size-3.5" />
              Abbrechen
            </Button>
          ) : null}
          {webAllowed ? (
            <label
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                web
                  ? "border-akzent/50 bg-akzent/10 text-akzent"
                  : "border-rand text-schrift-2 hover:bg-grund-3",
              )}
            >
              <input
                type="checkbox"
                checked={web}
                disabled={laeuft}
                onChange={(event) => setWeb(event.target.checked)}
                className="sr-only"
              />
              <Globe aria-hidden className="size-3.5" />
              Internet mitlesen
            </label>
          ) : null}
          {messages.length > 0 && !laeuft ? (
            <Button
              size="klein"
              variant="leise"
              onClick={() => {
                setMessages([]);
                setFehler(null);
              }}
            >
              <Trash2 aria-hidden className="size-3.5" />
              Gespräch verwerfen
            </Button>
          ) : null}
          <p className="text-xs text-schrift-3">
            Eingabe schickt ab · Umschalt+Eingabe für eine neue Zeile
          </p>
        </div>
      </div>
    </div>
  );
}
