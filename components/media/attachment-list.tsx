import {
  FileImage,
  FileText,
  FileType,
  Paperclip,
  Presentation,
  Sheet,
} from "lucide-react";

import { formatBytes } from "@/lib/library/media-kind";
import type { Attachment, Slug } from "@/lib/library/types";
import { attachmentUrl } from "@/lib/library/urls";

/**
 * Die Anhänge eines Beitrags: PDFs, Infografiken, Präsentationen.
 *
 * PDFs und Bilder zeigt der Browser selbst — sie öffnen in einem neuen Tab.
 * Alles andere wird geladen; das entscheidet die Route über
 * Content-Disposition, nicht dieses Bauteil.
 */
export function AttachmentList({
  slug,
  attachments,
}: {
  slug: Slug;
  attachments: Attachment[];
}) {
  if (attachments.length === 0) {
    return (
      <p className="p-4 text-sm text-schrift-2">
        Keine Anhänge. Dateien im Ordner{" "}
        <code className="rounded bg-grund-3 px-1">anhaenge/</code> des Beitrags
        erscheinen hier automatisch.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-rand">
      {attachments.map((attachment) => {
        const Icon = iconFor(attachment);
        return (
          <li key={attachment.file}>
            <a
              href={attachmentUrl(slug, attachment)}
              target={attachment.preview === "keine" ? undefined : "_blank"}
              rel="noopener"
              className="flex items-start gap-3 px-3 py-2.5 hover:bg-grund-3"
            >
              <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-schrift-3" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm leading-snug">
                  {attachment.label}
                </span>
                <span className="mt-0.5 block text-xs text-schrift-3">
                  {attachment.file} · {formatBytes(attachment.bytes)}
                  {attachment.preview === "keine" ? " · zum Speichern" : ""}
                </span>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function iconFor(attachment: Attachment) {
  if (attachment.preview === "bild") return FileImage;
  if (attachment.preview === "pdf") return FileText;
  if (/\.(pptx?|odp)$/i.test(attachment.file)) return Presentation;
  if (/\.(xlsx?|csv|ods)$/i.test(attachment.file)) return Sheet;
  if (/\.(docx?|odt|txt|md)$/i.test(attachment.file)) return FileType;
  return Paperclip;
}
