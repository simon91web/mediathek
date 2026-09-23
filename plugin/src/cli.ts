export type CliPreset = "grok" | "claude" | "custom";

export interface CliSettings {
  cliPreset: CliPreset;
  cliBinary: string;
  cliExtraArgs: string;
}

export function assertBinary(value: string): void {
  if (!value.trim()) {
    throw new Error("Kein Werkzeug eingestellt.");
  }
  if (/[\r\n\0]/.test(value)) {
    throw new Error("Ungültiger Werkzeugpfad.");
  }
}

export function splitArgs(value: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|[^\s]+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value))) {
    out.push(match[1] ?? match[2] ?? match[0]);
  }
  return out;
}

/**
 * Argumente ohne Shell. Der Auftragstext steht in einer Datei oder, bei
 * Claude, auf stdin. Er kommt nicht als weiteres Argument hinter `-p`.
 */
export function buildCliArgs(settings: CliSettings, promptFile: string): string[] {
  const extra = splitArgs(settings.cliExtraArgs);
  if (settings.cliPreset === "custom") {
    return extra.length > 0 ? extra : ["--prompt-file", promptFile];
  }
  if (settings.cliPreset === "claude") {
    return ["-p", "--permission-mode", "acceptEdits", ...extra];
  }
  return [
    "--prompt-file",
    promptFile,
    "--permission-mode",
    "acceptEdits",
    "--disable-web-search",
    ...extra,
  ];
}

export function sendsPromptOnStdin(preset: CliPreset): boolean {
  return preset === "claude";
}
