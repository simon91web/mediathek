import { assertBinary, buildCliArgs, sendsPromptOnStdin, type CliSettings } from "./cli";
import type { CliPreset } from "./cli";

export interface RunningCli {
  pid: number | null;
  cancel: () => void;
  done: Promise<{ code: number; output: string }>;
}

function nodeRequire<T>(id: string): T {
  const req = (window as unknown as { require?: (moduleId: string) => T }).require;
  if (typeof req !== "function") {
    throw new Error("CLI-Aufrufe gibt es nur in der Desktop-App.");
  }
  return req(id);
}

function knownBinary(preset: CliPreset, home: string, localAppData: string): string[] {
  if (preset === "grok") {
    return [`${home}\\.grok\\bin\\grok.exe`, `${home}/.grok/bin/grok`];
  }
  if (preset === "claude") {
    return [`${home}\\.local\\bin\\claude.exe`, `${home}/.local/bin/claude`];
  }
  return [];
}

export function resolveCliBinary(settings: CliSettings): string {
  if (settings.cliBinary.trim()) {
    assertBinary(settings.cliBinary);
    return settings.cliBinary.trim();
  }
  const os = nodeRequire<typeof import("os")>("os");
  const fs = nodeRequire<typeof import("fs")>("fs");
  const proc = nodeRequire<typeof import("process")>("process");
  const home = os.homedir();
  const localAppData = proc.env.LOCALAPPDATA ?? "";
  for (const candidate of knownBinary(settings.cliPreset, home, localAppData)) {
    if (fs.existsSync(candidate)) return candidate;
  }
  if (settings.cliPreset === "custom") {
    throw new Error("Für ein eigenes Programm muss der Pfad gesetzt sein.");
  }
  return settings.cliPreset;
}

function killTree(pid: number): void {
  const proc = nodeRequire<typeof import("process")>("process");
  const { spawn } = nodeRequire<typeof import("child_process")>("child_process");
  if (proc.platform === "win32") {
    spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { shell: false, windowsHide: true });
    return;
  }
  try {
    proc.kill(pid);
  } catch {
    // Der Lauf ist schon zu Ende.
  }
}

export function runVaultCli(
  settings: CliSettings & { timeoutSec: number },
  vaultDir: string,
  prompt: string,
): RunningCli {
  const fs = nodeRequire<typeof import("fs")>("fs");
  const os = nodeRequire<typeof import("os")>("os");
  const path = nodeRequire<typeof import("path")>("path");
  const { spawn } = nodeRequire<typeof import("child_process")>("child_process");

  const binary = resolveCliBinary(settings);
  assertBinary(binary);
  const promptFile = path.join(
    os.tmpdir(),
    `medienwerkbank-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`,
  );
  fs.writeFileSync(promptFile, prompt, "utf8");
  const args = buildCliArgs(settings, promptFile);

  const child = spawn(binary, args, {
    cwd: vaultDir,
    shell: false,
    windowsHide: true,
    env: nodeRequire<typeof import("process")>("process").env,
  });

  let output = "";
  child.stdout?.on("data", (chunk: { toString: () => string }) => {
    output += chunk.toString();
  });
  child.stderr?.on("data", (chunk: { toString: () => string }) => {
    output += chunk.toString();
  });
  if (sendsPromptOnStdin(settings.cliPreset)) {
    child.stdin?.write(prompt);
  }
  child.stdin?.end();

  let timer = 0;
  const done = new Promise<{ code: number; output: string }>((resolve, reject) => {
    timer = window.setTimeout(() => {
      if (child.pid) killTree(child.pid);
      reject(new Error(`Zeitlimit nach ${settings.timeoutSec} Sekunden.`));
    }, settings.timeoutSec * 1000);
    child.on("error", (error: Error) => {
      window.clearTimeout(timer);
      reject(new Error(`Werkzeug nicht startbar (${binary}): ${error.message}`));
    });
    child.on("close", (code: number | null) => {
      window.clearTimeout(timer);
      try {
        fs.unlinkSync(promptFile);
      } catch {
        // Die Datei ist schon weg.
      }
      resolve({ code: code ?? 1, output });
    });
  });

  return {
    pid: child.pid ?? null,
    cancel: () => {
      if (child.pid) killTree(child.pid);
    },
    done,
  };
}

