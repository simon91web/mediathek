import type { Metadata } from "next";

import {
  AutoJobsControl,
  FfmpegControl,
  SettingsSection,
} from "@/components/library/settings-controls";
import { PythonSetup } from "@/components/library/python-setup";
import { WhisperSettings } from "@/components/library/whisper-settings";
import { Leer } from "@/components/ui/basis";
import { getFeatures } from "@/lib/features";
import { readSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Verarbeitung" };

export default async function VerarbeitungPage() {
  const [features, settings] = await Promise.all([
    getFeatures(),
    readSettings(),
  ]);

  if (!features.authorMode) {
    return (
      <Leer titel="Nur im Autorenmodus">
        Transkription und Kachelbilder sind Autorensache. Der Autorenmodus lässt
        sich unter „Programm“ einschalten.
      </Leer>
    );
  }

  return (
    <div className="space-y-8">
      <SettingsSection
        title="Automatik"
        hint="was nach einem Import von selbst läuft"
      >
        <AutoJobsControl
          autoJobs={settings.autoJobs}
          authorMode={features.authorMode}
        />
      </SettingsSection>

      {features.python === "ok" ? (
        <WhisperSettings
          model={settings.whisperModel}
          language={settings.whisperLanguage}
          gpuReady={features.python === "ok"}
        />
      ) : (
        <SettingsSection
          title="Transkription"
          hint="die Python-Umgebung fehlt noch"
        >
          <PythonSetup ready={false} />
        </SettingsSection>
      )}

      <SettingsSection title="ffmpeg" hint="für Kachelbilder und die Tonspur">
        <FfmpegControl ffmpegDir={features.ffmpegDir} />
      </SettingsSection>
    </div>
  );
}
