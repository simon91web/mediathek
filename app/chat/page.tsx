import type { Metadata } from "next";

import { ChatView } from "@/components/chat/chat-view";
import { ButtonLink, Leer } from "@/components/ui/basis";
import { getFeatures } from "@/lib/features";
import { getLibrary, getQuestion } from "@/lib/library";
import { readSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Chat" };

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ frage?: string }>;
}) {
  const { frage } = await searchParams;
  const [features, settings, library] = await Promise.all([
    getFeatures(),
    readSettings(),
    getLibrary(),
  ]);

  /*
   * Von einer abgelegten Frage aus weiterreden: der Verlauf beginnt dann mit
   * ihr und ihrer Antwort. Ohne das fänge jede Nachfrage bei null an, und
   * man müsste die halbe Antwort noch einmal hinschreiben.
   */
  const mitgebracht = frage ? await getQuestion(frage) : null;

  /*
   * Kennung → Titel, damit ein Beleg „Cloud Compare 1 04:25" heißt und nicht
   * „cloud-compare-1 04:25". Nur diese zwei Felder gehen an den Client: der
   * ganze Bestand wäre ein Vielfaches an Daten für eine Beschriftung.
   */
  const titles = Object.fromEntries(
    library.items.map((item) => [item.slug, item.title]),
  );

  if (!settings.chatEnabled || features.readonly || !features.authorMode) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Leer titel="Der Chat ist nicht eingeschaltet">
          {features.readonly
            ? "Diese Mediathek ist zum Ansehen eingerichtet."
            : "Er startet bei jeder Frage ein Programm auf dieser Maschine, " +
              "das die Bibliothek liest. Deshalb muss man ihn ausdrücklich " +
              "einschalten — unter Einstellungen."}
        </Leer>
        <div className="mt-4 flex justify-center">
          <ButtonLink href="/einstellungen/assistent" variant="primaer">
            Zu den Einstellungen
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (features.assistant !== "ok") {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Leer titel="Das Werkzeug fehlt">
          „{features.assistantCommand}“ wurde auf dieser Maschine nicht
          gefunden. Unter Einstellungen lässt sich ein anderes eintragen.
        </Leer>
        <div className="mt-4 flex justify-center">
          <ButtonLink href="/einstellungen/assistent" variant="primaer">
            Zu den Einstellungen
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
        <p className="mt-1 text-sm text-schrift-2">
          Fragen an das eigene Material. Geantwortet wird aus den Dateien der
          Bibliothek — mit Beitrag und Zeitmarke als Beleg, zum Anklicken. Das
          Gespräch läuft über{" "}
          <code className="rounded bg-grund-3 px-1 text-xs">
            {features.assistantCommand}
          </code>{" "}
          auf dieser Maschine. Jede beantwortete Frage wird abgelegt und ist
          danach unter Fragen zu finden.
        </p>
      </div>

      <ChatView
        tool={features.assistantCommand}
        titles={titles}
        webAllowed={settings.chatWebAllowed}
        initialMessages={
          mitgebracht
            ? [
                { role: "frage", text: mitgebracht.question },
                { role: "antwort", text: mitgebracht.answer },
              ]
            : []
        }
      />
    </div>
  );
}
