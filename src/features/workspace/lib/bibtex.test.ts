import { describe, expect, it } from "vitest";
import { citationKey, toBibtex } from "./bibtex";

describe("toBibtex", () => {
  it("cites an article with authors, year, venue, and a DOI", () => {
    expect(
      toBibtex({
        title: "Attention Is All You Need",
        authors: ["Ashish Vaswani", "Noam Shazeer"],
        year: 2017,
        venue: "NeurIPS",
        url: "https://doi.org/10.48550/arXiv.1706.03762",
        kind: "pdf",
      }),
    ).toBe(
      [
        "@article{vaswani2017attention,",
        "  title = {{Attention Is All You Need}},",
        "  author = {Ashish Vaswani and Noam Shazeer},",
        "  year = {2017},",
        "  journal = {NeurIPS},",
        "  doi = {10.48550/arXiv.1706.03762}",
        "}",
      ].join("\n"),
    );
  });

  it("falls back to a misc entry with the URL and leaves out unknown fields", () => {
    expect(
      toBibtex({
        title: "R&D notes: 50% faster",
        authors: [],
        kind: "link",
        url: "https://x.org/a",
      }),
    ).toBe(
      [
        "@misc{rdnd,",
        "  title = {{R\\&D notes: 50\\% faster}},",
        "  url = {https://x.org/a}",
        "}",
      ].join("\n"),
    );
  });
});

describe("citationKey", () => {
  it("uses the family name, year, and first meaningful title word", () => {
    expect(citationKey({ title: "The Art of Proof", authors: ["Lovelace, Ada"], year: 1843 })).toBe(
      "lovelace1843art",
    );
    // Without an author: first meaningful title word, then the year (or "nd").
    expect(citationKey({ title: "On Computable Numbers", authors: [] })).toBe("computablend");
  });
});

describe("organization authors", () => {
  it("keeps an organization whole and keys it by its first word", () => {
    expect(
      toBibtex({
        title: "Research Twin White Paper",
        authors: ["Research Twin project working draft"],
        year: 2026,
        kind: "pdf",
      }),
    ).toBe(
      [
        "@misc{research2026research,",
        "  title = {{Research Twin White Paper}},",
        "  author = {{Research Twin project working draft}},",
        "  year = {2026}",
        "}",
      ].join("\n"),
    );
  });
});
