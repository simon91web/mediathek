import { startChat } from "@/lib/assistant/chat";
import type { ChatMessage } from "@/lib/assistant/chat";
import { assertAuthorMode, NotAllowedError } from "@/lib/features";
import { isAllowedHost, wrongHostMessage } from "@/lib/http/host";

/*
 * Ein Chatdurchgang.
 *
 * Route Handler und keine Server Action, weil die Antwort STRÖMT: ein
 * Werkzeug, das erst in den Dateien sucht, braucht schnell eine halbe
 * Minute, und so lange nichts zu sehen sieht aus wie kaputt.
 *
 * Weil das keine Server Action ist, fehlt die eingebaute Origin-Prüfung —
 * sie wird hier von Hand gemacht, zusammen mit der Host-Positivliste.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Der Chat darf lange dauern; die Grenze zieht lib/assistant/chat.ts. */
export const maxDuration = 300;

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

function isMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    (record.role === "frage" || record.role === "antwort") &&
    typeof record.text === "string"
  );
}

export async function POST(request: Request) {
  try {
    await assertAuthorMode();
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof NotAllowedError
            ? error.message
            : "Der Chat ist hier nicht möglich.",
      },
      { status: 403 },
    );
  }

  if (!sameOrigin(request)) {
    return Response.json({ error: "Verboten." }, { status: 403 });
  }
  const host = request.headers.get("host");
  if (!isAllowedHost(host)) {
    return Response.json(
      { error: wrongHostMessage(host).trim() },
      { status: 403 },
    );
  }

  let messages: ChatMessage[];
  let web = false;
  try {
    const body = (await request.json()) as { messages?: unknown; web?: unknown };
    if (!Array.isArray(body.messages) || !body.messages.every(isMessage)) {
      return Response.json({ error: "Unbrauchbare Anfrage." }, { status: 400 });
    }
    messages = body.messages;
    // Ob das Internet wirklich gelesen werden darf, entscheidet die
    // Einstellung — dieser Wunsch allein genügt nicht.
    web = body.web === true;
  } catch {
    return Response.json({ error: "Unbrauchbare Anfrage." }, { status: 400 });
  }

  const start = await startChat(messages, { web });
  if (!start.ok) {
    return Response.json({ error: start.error }, { status: 409 });
  }

  return new Response(start.stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // Kein Zwischenspeicher: jedes Stück soll sofort ankommen.
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
