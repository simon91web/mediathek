import type { Metadata } from "next";

import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { AutoAssistantSettings } from "@/components/assistant/auto-assistant-settings";
import { ChatSettings } from "@/components/chat/chat-settings";
import { Leer } from "@/components/ui/basis";
import { instructionsInstalled } from "@/lib/assistant/install";
import { getFeatures } from "@/lib/features";
import { getLibrary } from "@/lib/library";
import { readSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "KI-Assistent" };

export default async function AssistentPage() {
  const [library, features, settings, anleitungenDa] = await Promise.all([
    getLibrary(),
    getFeatures(),
    readSettings(),
    instructionsInstalled(),
  ]);

  if (!features.authorMode) {
    return (
      <Leer titel="Nur im Autorenmodus">
        Der Assistent schreibt in die Bibliothek und startet Programme auf
        dieser Maschine. Der Autorenmodus lässt sich unter „Programm“
        einschalten.
      </Leer>
    );
  }

  return (
    <div className="space-y-8">
      <AssistantPanel
        assistantReady={features.assistant === "ok"}
        assistantCommand={features.assistantCommand}
        assistantArgs={settings.assistantArgs}
        instructionsInstalled={anleitungenDa}
        libraryRoot={library.root}
      />

      <AutoAssistantSettings
        enabled={settings.autoAssistant}
        args={settings.autoAssistantArgs}
        chain={settings.autoChain}
        assistantCommand={features.assistantCommand}
        assistantReady={features.assistant === "ok"}
      />

      <ChatSettings
        enabled={settings.chatEnabled}
        chatArgs={settings.chatArgs}
        webAllowed={settings.chatWebAllowed}
        chatWebArgs={settings.chatWebArgs}
        assistantCommand={features.assistantCommand}
        assistantReady={features.assistant === "ok"}
      />
    </div>
  );
}
