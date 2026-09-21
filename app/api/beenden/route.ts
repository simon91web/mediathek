import { isAllowedHost, wrongHostMessage } from "@/lib/http/host";
import { shutdownJobs } from "@/lib/jobs";

/*
 * Beendet den Server — der Knopf in der Oberfläche. Das rote x am Fenster
 * räumt der Starter ebenfalls auf (kein Renderer mehr = Fenster zu).
 *
 * Nur von derselben Herkunft und nur unter einem erlaubten Host: sonst
 * könnte eine fremde Seite den Prozess umbringen.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const header = request.headers.get("host");
  if (!isAllowedHost(header)) {
    return new Response(wrongHostMessage(header), {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  if (!sameOrigin(request)) {
    return Response.json({ error: "Abgewiesen." }, { status: 403 });
  }

  try {
    await shutdownJobs();
  } catch {
    // Trotzdem beenden — ein hängender Auftrag darf den Knopf nicht blockieren.
  }

  setTimeout(() => {
    process.exit(0);
  }, 150);

  return Response.json({ ok: true });
}
