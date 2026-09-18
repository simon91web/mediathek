import type { Stufe } from "@/lib/library/types";

/*
 * Eine Zahl (73/100) würde Genauigkeit vortäuschen, die ein Textabgleich und
 * erst recht ein Sprachmodell nicht haben. Eine kleine Stufenskala aus einer
 * ehrlichen Zählung ist das Gegenteil davon — siehe lib/library/completeness.ts.
 */

export const STUFE_LABEL: Record<Stufe, string> = {
  ungeprueft: "ungeprüft",
  lueckenhaft: "lückenhaft",
  "im-aufbau": "im Aufbau",
  breit: "breit",
  vertieft: "vertieft",
};

export const STUFE_CLASS: Record<Stufe, string> = {
  ungeprueft: "bg-grund-3 text-schrift-3",
  lueckenhaft: "bg-warnung-grund text-warnung",
  "im-aufbau": "bg-warnung-grund text-warnung",
  breit: "bg-akzent/10 text-akzent",
  vertieft: "bg-akzent/10 text-akzent",
};
