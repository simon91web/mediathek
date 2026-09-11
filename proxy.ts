import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isAllowedHost, wrongHostMessage } from "@/lib/http/host";

/*
 * Host-Positivliste gegen DNS-Rebinding. Die Begründung steht in
 * lib/http/host.ts; hier steht nur, wofür der Proxy zuständig ist — und
 * wofür ausdrücklich nicht.
 *
 * Die Datei heißt "proxy.ts" und nicht "middleware.ts": ab Next 16.3 ist die
 * alte Benennung überholt, und "next build" sagt das auch.
 *
 * ==========================================================================
 * ACHTUNG, TEUER ERKAUFTE ERKENNTNIS: DER PROXY PUFFERT JEDEN RUMPF UND
 * KÜRZT IHN STILL BEI 10 MB.
 *
 * Aus der Next-Doku (proxyClientMaxBodySize): "Next.js automatically clones
 * the request body and buffers it in memory to enable multiple reads […] By
 * default, the maximum body size is 10MB. […] The request will **not** fail
 * or return an error to the client."
 *
 * Es genügt also, dass es diese Datei GIBT, damit jeder Upload nach zehn
 * Megabyte abgeschnitten wird — ohne Fehler, ohne Hinweis. Aufgefallen ist
 * es daran, dass importierte Videos alle exakt 10,0 MB groß waren, sich
 * nicht abspielen ließen und ffprobe sie nicht lesen konnte.
 *
 * Das Limit hochzusetzen ist KEINE Lösung: gepuffert wird im Arbeits-
 * speicher, und genau deshalb lädt die Upload-Route mit einem rohen Strom.
 * Ein Zwei-Gigabyte-Video würde dann eben zwei Gigabyte RAM kosten.
 *
 * Die Lösung ist der Ausschluss im Matcher unten. Jede Route, die einen
 * großen Rumpf streamt, muss dort hinein — und muss die Host-Prüfung dann
 * selbst aufrufen (isAllowedHost).
 * ==========================================================================
 */

export function proxy(request: NextRequest) {
  const header = request.headers.get("host");
  if (isAllowedHost(header)) return NextResponse.next();

  return new NextResponse(wrongHostMessage(header), {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export const config = {
  /*
   * Alles außer:
   *
   * - den statischen Bauteilen. Die kommen aus demselben Server, aber sie
   *   schreiben nichts, und jede geprüfte Anfrage kostet Zeit.
   * - "/api/import/hochladen". Dort liegt der große Rumpf; siehe oben. Die
   *   Route prüft den Host selbst.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/import/hochladen).*)",
  ],
};
