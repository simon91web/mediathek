import type { Metadata } from "next";

import {
  AuthorModeControl,
  SettingsSection,
} from "@/components/library/settings-controls";
import { Row, ToolRow } from "@/components/library/settings-rows";
import { ShortcutButton } from "@/components/library/shortcut-button";
import { getFeatures } from "@/lib/features";
import { findLauncher } from "@/lib/shell/shortcut";
import { libraryStateDir, settingsFile } from "@/lib/settings";

export const metadata: Metadata = { title: "Programm" };

export default async function ProgrammPage() {
  const [features, launcher] = await Promise.all([
    getFeatures(),
    findLauncher(),
  ]);

  return (
    <div className="space-y-8">
      <SettingsSection title="Bedienung">
        <AuthorModeControl
          authorMode={features.authorMode}
          readonly={features.readonly}
        />
      </SettingsSection>

      {launcher ? (
        <SettingsSection
          title="Starten"
          hint="ein eigenes Fenster, kein Browser-Tab"
        >
          <ShortcutButton />
        </SettingsSection>
      ) : null}

      <SettingsSection title="Werkzeuge auf dieser Maschine">
        <ToolRow
          state={features.python}
          label="Python für die Transkription"
          okText="eingerichtet — Beiträge lassen sich transkribieren"
          missingText={'fehlt; einrichten mit "npm run setup:python"'}
        />
        <ToolRow
          state={features.ffmpeg}
          label="ffmpeg"
          okText={
            features.ffmpegDir
              ? `gefunden in ${features.ffmpegDir}`
              : "über den Suchpfad gefunden"
          }
          missingText="wird für Kachelbilder und die Tonspur gebraucht"
        />
        <ToolRow
          state={features.assistant}
          label={`KI-Assistent (${features.assistantCommand})`}
          okText="gefunden — Kapitel, Themen und Chat lassen sich nutzen"
          missingText="unter KI-Assistent lässt sich ein anderes Programm eintragen"
        />
        <p className="border-t border-rand pt-3 text-xs text-schrift-2">
          Diese Werkzeuge braucht nur, wer Beiträge einpflegt. Zum Ansehen
          genügt der Server.
        </p>
      </SettingsSection>

      <SettingsSection title="Wo diese Mediathek ihre Notizen ablegt">
        <Row label="Einstellungen">
          <code className="text-xs break-all">{settingsFile()}</code>
        </Row>
        <Row label="Arbeitsdaten">
          <code className="text-xs break-all">{libraryStateDir()}</code>
        </Row>
        <p className="border-t border-rand pt-2 text-xs text-schrift-2">
          Bewusst außerhalb der Bibliothek: der Ordner wird weitergegeben und
          herumkopiert, und Programmpfade oder Laufwerksbuchstaben gelten nur
          auf dieser Maschine. Klemmt etwas, kann dieser Ordner gelöscht werden.
        </p>
      </SettingsSection>
    </div>
  );
}
