import path from "node:path";

/*
 * Eine neue Bibliothek anlegen: Verzeichnis wählen, Namen vergeben.
 *
 * Daraus wird `<Verzeichnis>/<Name>`, und das muss man SEHEN, bevor man
 * klickt — ein Knopf, nach dem irgendwo ein Ordner entstanden ist, ist ein
 * schlechter Knopf.
 *
 * DER FALL, DER DIESE DATEI NÖTIG MACHT: Jemand legt im Explorer
 * `D:\Mediathek` an, wählt diesen Ordner aus und tippt „Mediathek" als Namen
 * — weil man das eben so macht. Wörtlich genommen entstünde
 * `D:\Mediathek\Mediathek`, und der Ordner, den er gerade angelegt hat, bliebe
 * leer daneben stehen. Das ist nicht falsch programmiert, es ist nur nicht,
 * was gemeint war.
 *
 * Deshalb wird in diesem Fall VORGESCHLAGEN, den gewählten Ordner selbst zu
 * nehmen. Vorgeschlagen, nicht entschieden: `D:\Projekte\Projekte` kann
 * jemand genau so wollen.
 *
 * Bewusst ohne node:fs — was es auf der Platte schon gibt, weiß der Aufrufer
 * besser, und so ist die Regel selbst prüfbar.
 */

/** Zeichen, die Windows in einem Ordnernamen nicht zulässt. */
const VERBOTEN = /[<>:"/\\|?*\u0000-\u001f]/g;

/**
 * Aus dem eingetippten Namen einen Ordnernamen machen.
 *
 * Anders als `slugify` bleibt er lesbar: „Meine Mediathek" ist ein guter
 * Ordnername, `meine-mediathek` wäre nur eine Kennung. Ordnernamen der
 * Bibliothek sieht der Nutzer im Explorer.
 */
export function folderName(name: string): string {
  return (
    name
      .trim()
      .replace(VERBOTEN, "")
      .replace(/\s+/g, " ")
      /*
       * Windows schneidet Punkte und Leerzeichen am Ende still ab und man
       * bekommt einen Ordner, den man danach kaum wieder los wird.
       */
      .replace(/[.\s]+$/, "")
      .slice(0, 64)
  );
}

/** Reservierte Gerätenamen — als Ordnername unter Windows nicht benutzbar. */
const RESERVIERT = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

export type LibraryPlan =
  | {
      ok: true;
      /** Der Ordner, der am Ende die Bibliothek ist. */
      target: string;
      /** Der bereinigte Ordnername. */
      folder: string;
      /**
       * Der gewählte Ordner heißt schon so wie der Name. Dann wird
       * vorgeschlagen, ihn selbst zu nehmen, statt darin einen gleichnamigen
       * anzulegen.
       */
      suggestParent: boolean;
    }
  | { ok: false; error: string };

/**
 * Was aus Verzeichnis und Name wird.
 *
 * `target` ist immer das, was ohne weiteres Zutun entstünde. Ist
 * `suggestParent` gesetzt, bietet die Oberfläche zusätzlich den gewählten
 * Ordner selbst an — die Entscheidung trifft der Mensch.
 */
export function planLibraryFolder(
  parent: string,
  name: string,
): LibraryPlan {
  const verzeichnis = parent.trim().replace(/^"|"$/g, "");
  if (!verzeichnis) {
    return { ok: false, error: "Es ist kein Verzeichnis gewählt." };
  }
  if (!path.isAbsolute(verzeichnis)) {
    return {
      ok: false,
      error: "Bitte ein Verzeichnis mit vollständigem Pfad wählen.",
    };
  }

  const folder = folderName(name);
  if (!folder) {
    return {
      ok: false,
      error:
        "Der Name ist leer oder besteht nur aus Zeichen, die in einem " +
        'Ordnernamen nicht vorkommen dürfen (\\ / : * ? " < > |).',
    };
  }
  if (RESERVIERT.has(folder.toLowerCase())) {
    return {
      ok: false,
      error: `„${folder}" ist unter Windows ein Gerätename und geht als Ordner nicht.`,
    };
  }

  const eltern = path.resolve(verzeichnis);
  const target = path.join(eltern, folder);

  /*
   * Heißt der gewählte Ordner schon so? Verglichen wird ohne Rücksicht auf
   * Groß- und Kleinschreibung: unter Windows sind "Mediathek" und
   * "mediathek" derselbe Ordner, und wer den einen tippt und den anderen
   * gewählt hat, meint dasselbe.
   */
  const suggestParent =
    path.basename(eltern).toLowerCase() === folder.toLowerCase();

  return { ok: true, target, folder, suggestParent };
}
