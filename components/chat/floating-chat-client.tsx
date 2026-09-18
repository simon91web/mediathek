"use client";

import { useState } from "react";
import Link from "next/link";
import { History, MessageSquare, Settings, X } from "lucide-react";

import { ChatView } from "@/components/chat/chat-view";

export function FloatingChatClient({
  tool,
  titles,
  webAllowed,
}: {
  tool: string;
  titles: Readonly<Record<string, string>>;
  webAllowed: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Chat öffnen"
        title="Chat"
        className="fixed right-6 bottom-6 z-40 flex size-14 items-center
          justify-center rounded-full bg-akzent text-white shadow-lg
          transition-colors hover:bg-akzent-dunkel"
      >
        <MessageSquare aria-hidden className="size-6" />
      </button>
    );
  }

  return (
    <div
      className="fixed right-6 bottom-6 z-40 flex h-[560px] w-96 flex-col
        overflow-hidden rounded-xl border border-rand bg-grund shadow-2xl"
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-rand py-2 pr-2 pl-4">
        <p className="grow text-sm font-semibold">Chat</p>
        <Link
          href="/fragen"
          title="Alte Chats — bisher beantwortete Fragen"
          aria-label="Alte Chats"
          className="flex size-8 items-center justify-center rounded-md text-schrift-2 hover:bg-grund-2 hover:text-schrift"
        >
          <History aria-hidden className="size-4" />
        </Link>
        <Link
          href="/einstellungen/assistent"
          title="KI-Einstellungen"
          aria-label="KI-Einstellungen"
          className="flex size-8 items-center justify-center rounded-md text-schrift-2 hover:bg-grund-2 hover:text-schrift"
        >
          <Settings aria-hidden className="size-4" />
        </Link>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Chat schließen"
          title="Schließen"
          className="flex size-8 items-center justify-center rounded-md text-schrift-2 hover:bg-grund-2 hover:text-schrift"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>

      <div className="grow overflow-y-auto p-3">
        <ChatView tool={tool} titles={titles} webAllowed={webAllowed} />
      </div>
    </div>
  );
}
