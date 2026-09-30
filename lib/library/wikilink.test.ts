import { describe, expect, it } from "vitest";

import { findWikilinks, referenceHref } from "./wikilink";

describe("Bezug als Bereich", () => {
  it("liest Anfang und Ende und gibt beides an den Player", () => {
    const [link] = findWikilinks("- [[akku-pruefen#12:40-18:05]] Derselbe Vorgang");
    expect(link?.target).toEqual({ kind: "zeit", start: 760, end: 1085 });
    expect(referenceHref("akku-pruefen", link.target)).toBe("/medien/akku-pruefen?t=760&bis=1085");
  });

  it("lässt eine einzelne Stelle ohne Ende", () => {
    const [link] = findWikilinks("[[akku-pruefen#12:40]]");
    expect(referenceHref("akku-pruefen", link.target)).toBe("/medien/akku-pruefen?t=760");
  });
});
