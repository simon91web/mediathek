import { FileSystemAdapter, MarkdownView, Modal, Notice, Plugin, Setting } from "obsidian";

import { filesToCopy } from "./install";
import { copyIfMissing, listRelativeFiles, vaultHas } from "./bundled";
import { runVaultCli, type RunningCli } from "./cli-run";
import { secondsInHeading, stopAfter } from "./seek";
import { DEFAULT_SETTINGS, normalizeSettings, type MedienwerkbankSettings } from "./settings";
import { MedienwerkbankSettingTab } from "./settings-tab";
import {
  TASK_LABEL,
  TASKS,
  assertToolsetVersion,
  buildBestandPrompt,
  buildPrompt,
  needsNote,
  type TaskId,
} from "./tasks";

interface StopHook {
  video: HTMLVideoElement;
  onTime: () => void;
}

export default class MedienwerkbankPlugin extends Plugin {
  settings: MedienwerkbankSettings = DEFAULT_SETTINGS;
  private run: RunningCli | null = null;
  private status: HTMLElement | null = null;
  private stopHook: StopHook | null = null;

  async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
    this.addSettingTab(new MedienwerkbankSettingTab(this.app, this));
    this.status = this.addStatusBarItem();

    for (const task of TASKS) {
      if (task === "bestand") continue;
      this.addCommand({
        id: task,
        name: TASK_LABEL[task],
        callback: () => {
          void this.runTask(task);
        },
      });
    }

    this.addCommand({
      id: "bestand",
      name: TASK_LABEL.bestand,
      callback: () => {
        new FrageModal(this.app, (question) => {
          void this.runTask("bestand", question);
        }).open();
      },
    });

    this.addCommand({
      id: "vorlage",
      name: "Fehlende Anleitungen in den Vault legen",
      callback: () => {
        void this.installMissing();
      },
    });

    this.addCommand({
      id: "abbrechen",
      name: "Lauf abbrechen",
      checkCallback: (checking) => {
        if (!this.run) return false;
        if (!checking) this.run.cancel();
        return true;
      },
    });

    this.addCommand({
      id: "kapitel-abspielen",
      name: "Kapitel unter dem Cursor abspielen",
      editorCheckCallback: (checking, editor) => {
        const seconds = secondsInHeading(editor.getLine(editor.getCursor().line));
        if (seconds === null) return false;
        if (!checking) this.seekSeconds(seconds, null);
        return true;
      },
    });

    this.registerMarkdownPostProcessor((element) => {
      this.decorateHeadings(element);
    });
  }

  onunload(): void {
    this.clearStop();
    this.run?.cancel();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private vaultDir(): string {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      throw new Error("Der Vault liegt nicht auf der Festplatte.");
    }
    return adapter.getBasePath();
  }

  private bundledDir(): string {
    const dir = this.manifest.dir;
    if (!dir) throw new Error("Der Plugin-Ordner ist unbekannt.");
    const path = (window as unknown as { require: (id: string) => typeof import("path") }).require(
      "path",
    );
    return path.join(dir, "bundled");
  }

  private async installMissing(): Promise<void> {
    try {
      const bundled = listRelativeFiles(this.bundledDir());
      const vault = this.vaultDir();
      const existing = new Set(bundled.filter((file) => vaultHas(vault, file)));
      const missing = filesToCopy(bundled, existing);
      for (const file of missing) copyIfMissing(this.bundledDir(), vault, file);
      new Notice(
        missing.length === 0
          ? "Die Anleitungen liegen schon im Vault. Nichts ersetzt."
          : `${missing.length} Dateien ergänzt. Vorhandene bleiben.`,
      );
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Vorlage fehlgeschlagen.");
    }
  }

  private noteName(): string | null {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") return null;
    return file.basename;
  }

  private async runTask(task: TaskId, question?: string): Promise<void> {
    if (this.run) {
      new Notice("Es läuft schon ein Auftrag.");
      return;
    }
    try {
      const vault = this.vaultDir();
      const toolset = vaultHas(vault, "toolset.yaml")
        ? await this.app.vault.adapter.read("toolset.yaml")
        : null;
      assertToolsetVersion(toolset);
      const instruction = `anleitungen/${task}.md`;
      if (!vaultHas(vault, instruction)) {
        new Notice(`${instruction} fehlt. Befehl: Fehlende Anleitungen in den Vault legen.`);
        return;
      }
      const note = this.noteName();
      if (needsNote(task) && !note) {
        new Notice("Keine Notiz offen.");
        return;
      }
      if (task === "sichtung" && !note) {
        new Notice("Öffne die Datei in der Inbox, die beurteilt werden soll.");
        return;
      }
      const prompt =
        task === "bestand"
          ? buildBestandPrompt(question ?? "")
          : task === "sichtung"
            ? `${buildPrompt(task, null)} Es geht um die Datei ${note ?? ""}.`
            : buildPrompt(task, needsNote(task) ? note : null);
      if (task === "bestand" && !question?.trim()) {
        new Notice("Die Frage ist leer.");
        return;
      }

      this.setStatus(`${TASK_LABEL[task]} …`);
      const running = runVaultCli({ ...this.settings, timeoutSec: this.settings.timeoutSec }, vault, prompt);
      this.run = running;
      const result = await running.done;
      this.run = null;
      this.setStatus("");
      if (result.code !== 0) {
        new Notice(result.output.trim().slice(-500) || `Auftrag endete mit Code ${result.code}.`);
        return;
      }
      new Notice(`${TASK_LABEL[task]} ist durch.`);
    } catch (error) {
      this.run = null;
      this.setStatus("");
      new Notice(error instanceof Error ? error.message : "Auftrag fehlgeschlagen.");
    }
  }

  private setStatus(text: string): void {
    if (!this.status) return;
    this.status.setText(text);
  }

  private decorateHeadings(root: HTMLElement): void {
    for (const heading of root.querySelectorAll("h2, h3")) {
      if (!(heading instanceof HTMLElement)) continue;
      if (heading.querySelector(".mw-seek")) continue;
      const seconds = secondsInHeading(heading.textContent ?? "");
      if (seconds === null) continue;
      heading.dataset.seconds = String(seconds);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mw-seek";
      button.textContent = "ab hier";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.seekSeconds(seconds, root);
      });
      heading.prepend(button);
    }
  }

  private seekSeconds(seconds: number, scope: HTMLElement | null): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const root = scope?.closest(".markdown-preview-view") ?? view?.containerEl ?? null;
    const video = root?.querySelector("video");
    if (!(video instanceof HTMLVideoElement)) {
      new Notice("In dieser Notiz ist kein Film eingebettet.");
      return;
    }
    const starts: number[] = [];
    for (const heading of root?.querySelectorAll("h2, h3") ?? []) {
      const stored = heading instanceof HTMLElement ? heading.dataset.seconds : undefined;
      const start = stored !== undefined ? Number(stored) : secondsInHeading(heading.textContent ?? "");
      if (start !== null && Number.isFinite(start)) starts.push(start);
    }
    this.clearStop();
    video.currentTime = seconds;
    void video.play();
    const end = stopAfter(seconds, starts);
    if (end === null) return;
    const onTime = () => {
      if (video.currentTime >= end) {
        video.pause();
        this.clearStop();
      }
    };
    video.addEventListener("timeupdate", onTime);
    this.stopHook = { video, onTime };
  }

  private clearStop(): void {
    if (!this.stopHook) return;
    this.stopHook.video.removeEventListener("timeupdate", this.stopHook.onTime);
    this.stopHook = null;
  }
}

class FrageModal extends Modal {
  private value = "";

  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    private readonly onSubmit: (question: string) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Bestand fragen" });
    contentEl.createEl("p", {
      text: "Die Antwort wird als neue Notiz unter Fragen/ abgelegt. Belege sind Wikilinks.",
    });
    new Setting(contentEl).setName("Frage").addTextArea((text) => {
      text.onChange((value) => {
        this.value = value;
      });
      text.inputEl.rows = 5;
      text.inputEl.style.width = "100%";
    });
    new Setting(contentEl).addButton((button) => {
      button.setButtonText("Fragen").setCta().onClick(() => {
        this.close();
        this.onSubmit(this.value);
      });
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
