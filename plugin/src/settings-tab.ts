import { App, PluginSettingTab, Setting } from "obsidian";

import type MedienwerkbankPlugin from "./main";

export class MedienwerkbankSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: MedienwerkbankPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Medienwerkbank" });
    containerEl.createEl("p", {
      text: "Das Werkzeug läuft im Vault und liest die Anleitungen dort. Grok bekommt den Auftrag als Datei, Claude über die Standardeingabe. Bearbeiten von Dateien ist eingeschaltet.",
    });

    new Setting(containerEl)
      .setName("Werkzeug")
      .setDesc("grok und claude sind vorbelegt. Eigenes Programm: nur der Name oder ein Pfad, keine Argumente in diesem Feld.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("grok", "grok")
          .addOption("claude", "claude")
          .addOption("custom", "eigenes Programm")
          .setValue(this.plugin.settings.cliPreset)
          .onChange(async (value) => {
            if (value === "grok" || value === "claude" || value === "custom") {
              this.plugin.settings.cliPreset = value;
              await this.plugin.saveSettings();
            }
          });
      });

    new Setting(containerEl)
      .setName("Programm")
      .setDesc("Leer lässt grok oder claude suchen. Sonst der Pfad, zum Beispiel C:\\Users\\…\\.grok\\bin\\grok.exe.")
      .addText((text) => {
        text
          .setPlaceholder("grok")
          .setValue(this.plugin.settings.cliBinary)
          .onChange(async (value) => {
            this.plugin.settings.cliBinary = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Zusätzliche Argumente")
      .setDesc("Werden angehängt. Kein Auftragstext hier hinein.")
      .addText((text) => {
        text.setValue(this.plugin.settings.cliExtraArgs).onChange(async (value) => {
          this.plugin.settings.cliExtraArgs = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Zeitlimit in Sekunden")
      .setDesc("Danach wird der Lauf abgebrochen. Mindestens 30.")
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings.timeoutSec))
          .onChange(async (value) => {
            const parsed = Number(value);
            if (Number.isFinite(parsed) && parsed >= 30) {
              this.plugin.settings.timeoutSec = parsed;
              await this.plugin.saveSettings();
            }
          });
      });
  }
}
