import { jobSnapshot } from "@/lib/jobs";

/**
 * Der Stand aller Aufträge als einmalige Antwort.
 *
 * Der Rückfall für den Fall, dass die Ereignisverbindung nicht zustande
 * kommt — dieselben Daten, nur abgefragt statt geschoben.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return Response.json(await jobSnapshot(), {
    headers: { "Cache-Control": "no-store" },
  });
}
