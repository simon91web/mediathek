import { subscribeJobs } from "@/lib/jobs";
import type { JobSnapshot } from "@/lib/jobs";

/*
 * Fortschritt als Ereignisstrom (Server-Sent Events).
 *
 * Warum hier SSE und beim Bibliotheks-Puls nicht: ein Transkriptionslauf
 * dauert Minuten und meldet ein- bis zweimal je Sekunde. Abfragen im
 * gewünschten Takt hieße ein Aufruf je Sekunde und offenem Tab — bei einem
 * 90-Minuten-Lauf und drei Tabs sind das tausende sinnloser Anfragen, die
 * jedes Mal einen Route-Handler wecken.
 *
 * Zudem verbindet der Browser eine EventSource von sich aus neu. Damit ist
 * "übersteht ein Neuladen der Seite" gratis erfüllt: das erste Ereignis ist
 * immer ein vollständiger Stand.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Damit Zwischenspeicher auf dem Weg die Verbindung nicht puffern. */
const HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

/** Höchstens vier Ereignisse je Sekunde — mehr sieht kein Mensch. */
const COALESCE_MS = 250;
const KEEPALIVE_MS = 15_000;

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | null = null;
  let keepalive: NodeJS.Timeout | null = null;
  let coalesce: NodeJS.Timeout | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // Verbindung ist weg; das Aufräumen übernimmt der abort-Handler.
        }
      };

      let pending: JobSnapshot | null = null;
      const flush = () => {
        coalesce = null;
        if (pending) {
          send("snapshot", pending);
          pending = null;
        }
      };

      unsubscribe = await subscribeJobs((snapshot) => {
        pending = snapshot;
        if (coalesce) return;
        coalesce = setTimeout(flush, COALESCE_MS);
        coalesce.unref?.();
      });

      keepalive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          // Siehe oben.
        }
      }, KEEPALIVE_MS);
      keepalive.unref?.();
    },

    cancel() {
      cleanup();
    },
  });

  /*
   * Das Abmelden hier zu vergessen ist das klassische Leck: nach einem
   * Dutzend Neuladen im Entwicklungsbetrieb hängen ein Dutzend Zuhörer an
   * der Schlange und der Server wird träge.
   */
  function cleanup() {
    if (closed) return;
    closed = true;
    unsubscribe?.();
    if (keepalive) clearInterval(keepalive);
    if (coalesce) clearTimeout(coalesce);
  }

  request.signal.addEventListener("abort", cleanup, { once: true });

  return new Response(stream, { headers: HEADERS });
}
