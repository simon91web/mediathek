import { isSlug } from "@/lib/library/slug";
import { getTranscript } from "@/lib/library/transcript";

/*
 * Das Transkript wird nachgeladen, wenn jemand den Tab öffnet — nie beim
 * Aufbau der Seite. Ein 90-Minuten-Beitrag hat schnell tausend Segmente, und
 * die haben in der ersten Antwort nichts zu suchen.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  if (!isSlug(slug)) return new Response("Nicht gefunden", { status: 404 });

  const transcript = await getTranscript(slug);
  if (!transcript) {
    return Response.json(
      { segments: [], message: "Für diesen Beitrag gibt es kein Transkript." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(transcript, {
    headers: { "Cache-Control": "no-store" },
  });
}
