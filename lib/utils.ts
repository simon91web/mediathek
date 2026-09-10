import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Deutsche Ein-/Mehrzahl, ohne Bibliothek. */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "2026-04-17" → "17. April 2026". Ohne Date-Objekt, also ohne Zeitzonen. */
const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export function formatRecorded(recorded: string | null): string | null {
  if (!recorded) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(recorded);
  if (!match) return recorded;
  const [, year, month, day] = match;
  const name = MONTHS[Number(month) - 1];
  if (!name) return recorded;
  return `${Number(day)}. ${name} ${year}`;
}

/** Dauer für Kacheln: "3:00" oder "1:02:03". */
export function formatDurationShort(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
