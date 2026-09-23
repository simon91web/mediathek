import type { CliPreset } from "./cli";

export interface MedienwerkbankSettings {
  cliPreset: CliPreset;
  cliBinary: string;
  cliExtraArgs: string;
  timeoutSec: number;
}

export const DEFAULT_SETTINGS: MedienwerkbankSettings = {
  cliPreset: "grok",
  cliBinary: "",
  cliExtraArgs: "",
  timeoutSec: 900,
};

export function normalizeSettings(raw: unknown): MedienwerkbankSettings {
  const value = raw && typeof raw === "object" ? (raw as Partial<MedienwerkbankSettings>) : {};
  const preset = value.cliPreset;
  return {
    cliPreset: preset === "claude" || preset === "custom" || preset === "grok" ? preset : "grok",
    cliBinary: typeof value.cliBinary === "string" ? value.cliBinary : "",
    cliExtraArgs: typeof value.cliExtraArgs === "string" ? value.cliExtraArgs : "",
    timeoutSec:
      typeof value.timeoutSec === "number" && value.timeoutSec >= 30
        ? value.timeoutSec
        : DEFAULT_SETTINGS.timeoutSec,
  };
}
