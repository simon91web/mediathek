import "server-only";

import { reloadLibrary } from "@/lib/library";
import { ensureSearchIndex, invalidateSearchIndex } from "@/lib/search";
import { JobError } from "./queue";
import type { JobContext } from "./queue";

/*
 * Die Suche auf den neuesten Stand bringen.
 *
 * Für sich genommen bräuchte es diesen Auftrag nicht: der Index baut sich
 * beim ersten Suchen von selbst. In der Kette hat er aber seinen Platz — und
 * zwar genau dort, wo er steht:
 *
 * - NACH Transkript und Kapiteln, weil er beides indiziert. Davor gebaut,
 *   enthielte er den halben Beitrag.
 * - VOR den Bezügen, weil das Suchen nach verwandten Stellen genau das ist,
 *   was der nächste Schritt tut.
 *
 * Wer den Index hier baut, wartet einmal beim Einpflegen statt beim ersten
 * Suchen — und das ist der Moment, in dem Warten nicht stört.
 */

export async function runSearchIndexJob(context: JobContext): Promise<void> {
  const { update, log } = context;

  update({
    stage: "suchindex",
    progress: 0.1,
    message: "Bibliothek wird gelesen …",
  });
  await reloadLibrary();

  update({ progress: 0.3, message: "Index wird gebaut …" });
  invalidateSearchIndex();
  const status = await ensureSearchIndex();

  if (status.error) {
    throw new JobError("internal", status.error);
  }

  log(
    `Index: ${status.blocks} Blöcke aus ${status.items} Beiträgen, ` +
      `${status.state}`,
  );

  /*
   * Auch ein Rückfall auf den reinen Teilstring-Durchgang ist kein Fehler —
   * gesucht wird dann langsamer, aber vollständig. Gesagt wird es trotzdem.
   */
  update({
    progress: 1,
    message:
      status.state === "abgebrochen"
        ? "Der Index riss die Größengrenze — es wird nur noch wörtlich gesucht."
        : `${status.blocks} Blöcke aus ${status.items} Beiträgen im Index.`,
  });
}
