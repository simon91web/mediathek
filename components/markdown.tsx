import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

import type { Chapter } from "@/lib/library/types";

/*
 * Markdown wird ausschließlich auf dem Server gerendert. Damit landen
 * react-markdown und remark-gfm nicht im Client-Bündel, und es gibt kein
 * dangerouslySetInnerHTML für fremden Text.
 */

/** Nur die Elemente überschreiben, bei denen es etwas zu regeln gibt. */
const BASE_COMPONENTS: Components = {
  a({ href, children, ...props }) {
    const external = href?.startsWith("http");
    return (
      <a
        href={href}
        {...props}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
      </a>
    );
  },
};

export function MarkdownText({ children }: { children: string }) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} components={BASE_COMPONENTS}>
      {children}
    </Markdown>
  );
}

/**
 * Wie MarkdownText, setzt aber `id` auf die Überschriften der Ebenen 2 und 3.
 *
 * Die Anker kommen aus der bereits gebauten Kapitelliste und werden in
 * Dokumentreihenfolge vergeben — genau in der Reihenfolge, in der
 * parseSectionLines() sie gefunden hat. So können Anker und Inhaltsverzeichnis
 * nicht auseinanderlaufen, auch nicht bei doppelten Überschriftentiteln.
 */
export function MarkdownWithAnchors({
  children,
  chapters,
}: {
  children: string;
  chapters: Chapter[];
}) {
  const anchors = chapters
    .filter((chapter) => chapter.kind === "abschnitt")
    .map((chapter) => (chapter.kind === "abschnitt" ? chapter.anchor : ""));

  let cursor = 0;
  const nextAnchor = () => anchors[cursor++];

  const components: Components = {
    ...BASE_COMPONENTS,
    h2({ children: content, ...props }) {
      return (
        <h2 id={nextAnchor()} {...props}>
          {content}
        </h2>
      );
    },
    h3({ children: content, ...props }) {
      return (
        <h3 id={nextAnchor()} {...props}>
          {content}
        </h3>
      );
    },
  };

  return (
    <Markdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </Markdown>
  );
}
