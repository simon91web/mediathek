import { getFeatures } from "@/lib/features";
import { getLibrary } from "@/lib/library";
import { readSettings } from "@/lib/settings";
import { FloatingChatClient } from "./floating-chat-client";

/*
 * Der Chat als schwebender Knopf statt Kopfzeilen-Symbol (Issue #9) — unten
 * rechts, auf jeder Seite gleich erreichbar, statt eine Route für sich zu
 * sein. /chat bleibt daneben bestehen.
 *
 * Strenger gegated als früher das Kopfzeilen-Symbol (das nur chatEnabled und
 * !readonly prüfte): ein schwebender Knopf, der nur zu einer
 * "ausgeschaltet"-Meldung führt, wäre auf jeder Seite ein Symbol ohne
 * Nutzen. Serverseitig geprüft, weil die Voraussetzungen (Werkzeug
 * gefunden, Bibliothek gelesen) nicht im Client-Bundle landen sollen.
 */
export async function FloatingChat() {
  const [features, settings, library] = await Promise.all([
    getFeatures(),
    readSettings(),
    getLibrary(),
  ]);

  if (
    !settings.chatEnabled ||
    features.readonly ||
    !features.authorMode ||
    features.assistant !== "ok"
  ) {
    return null;
  }

  const titles = Object.fromEntries(
    library.items.map((item) => [item.slug, item.title]),
  );

  return (
    <FloatingChatClient
      tool={features.assistantCommand}
      titles={titles}
      webAllowed={settings.chatWebAllowed}
    />
  );
}
