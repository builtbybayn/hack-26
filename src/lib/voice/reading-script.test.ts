import { describe, expect, it } from "vitest";
import type { ParsedDocument } from "@/types/ingestion";
import {
  buildReadingScript,
  MAX_SEGMENT_CHARACTERS,
  segmentContext,
  segmentText,
  speakable,
} from "./reading-script";

const HEADER = "JOURNAL OF EXAMPLES · VOL 3";

/** A PDF-shaped document: one section per page, heading line inside the page text. */
function pdf(pages: { heading: string | null; lines: string[] }[]): ParsedDocument {
  const texts = pages.map((page, index) => [HEADER, ...page.lines, String(index + 1)].join("\n"));
  return {
    id: "doc",
    format: "pdf",
    sourceType: "pdf",
    source: { fileName: "paper.pdf", mimeType: "application/pdf", sizeBytes: 1 },
    title: "Paper",
    text: texts.join("\n\n"),
    pages: texts.map((text, index) => ({ pageNumber: index + 1, text })),
    sections: pages.map((page, index) => ({
      id: `page-${index + 1}`,
      heading: page.heading,
      level: page.heading ? 2 : 0,
      text: texts[index],
      pageNumbers: [index + 1],
    })),
    metadata: { pageCount: pages.length },
    provenance: { parser: "standard", externalProcessing: false },
    stats: { characters: 0, words: 0, lines: 0 },
    warnings: [],
    parsedAt: "2026-01-01T00:00:00.000Z",
  };
}

const LINE = "This sentence is long enough to count as an ordinary wrapped line of body text";

const paper = pdf([
  { heading: "Contents", lines: ["Contents", "1 Introduction 1", "2 Methods 2"] },
  {
    heading: "1 Introduction",
    lines: [
      "1 Introduction",
      `${LINE} and it con-`,
      `tinues on the next line of this paragraph, which is long enough to wrap, with a con-`,
      `sistently analyzed compound word that the author wrote as something like data-`,
      "driven work and a citation [12] (Smith et al., 2020).",
      "A second paragraph starts here.",
    ],
  },
  {
    heading: null,
    lines: [
      `${LINE} and the paragraph keeps going across the page break`,
      "until it finally ends.",
      "1.1 Background",
      "See Fig. 2 and Eq. 3, e.g. the model at https://example.com/x.",
      "∇ · E = ρ / ε₀",
      "∇ × B = μ₀ J",
      "(1)",
    ],
  },
  {
    heading: "References",
    lines: ["References", "[1] Smith, J. A paper that should never be read aloud."],
  },
]);
// "consistently" and "data-driven" appear elsewhere, so the cleaner can tell breaks from compounds.
paper.text += "\nconsistently data-driven continues";

describe("buildReadingScript", () => {
  const script = buildReadingScript(paper);
  const texts = script.segments.map((segment) => segment.text);
  const all = texts.join("\n");

  it("removes running headers and page numbers", () => {
    expect(all).not.toContain("JOURNAL OF EXAMPLES");
    expect(texts).not.toContain("2");
  });

  it("skips the contents page and stops at the references", () => {
    expect(all).not.toContain("Methods 2");
    expect(all).not.toContain("never be read aloud");
    expect(texts.at(-1)).toBe("The reference list is not read aloud.");
  });

  it("strips section numbers from headings and keeps subheadings", () => {
    expect(script.sections.map((section) => section.heading)).toEqual(["Introduction"]);
    expect(script.segments.filter((s) => s.kind === "heading").map((s) => s.text)).toEqual([
      "Introduction",
      "Background",
    ]);
  });

  it("rebuilds paragraphs from wrapped lines, including across pages", () => {
    const first = texts.find((text) => text.startsWith("This sentence"))!;
    expect(first).toContain("it continues on the next line");
    expect(first).toContain("with a consistently analyzed compound");
    expect(first).toContain("something like data-driven work and a citation.");
    // A short sentence-ending line ends the paragraph. Short paragraphs are then merged into one
    // segment, kept apart by a newline so the voice still pauses between them.
    expect(all).toContain("a citation.\nA second paragraph starts here.");
    expect(all).toContain("across the page break until it finally ends.");
  });

  it("removes citations and URLs and expands abbreviations", () => {
    expect(all).not.toMatch(/\[12\]|Smith et al|example\.com/);
    expect(all).toContain("See Figure 2 and Equation 3, for example, the model at.");
  });

  it("replaces an equation block with one notice pointing at its page", () => {
    const notices = script.segments.filter((segment) => segment.kind === "notice");
    expect(notices[0]).toMatchObject({
      text: "An equation appears here. You can view it on page 3 of the PDF.",
      pageNumber: 3,
    });
    expect(notices).toHaveLength(2); // the equation block and the references notice
  });

  it("counts spoken characters per section and in total", () => {
    const sum = script.segments.reduce((total, segment) => total + segment.text.length, 0);
    expect(script.characterCount).toBe(sum);
    expect(script.segments.every((segment, index) => segment.index === index)).toBe(true);
  });
});

describe("segmentText", () => {
  it("splits long text at sentence boundaries under the segment limit", () => {
    const sentence = "Every sentence here is about forty characters. ";
    const segments = segmentText(sentence.repeat(80));
    expect(segments.length).toBeGreaterThan(1);
    expect(segments.every((segment) => segment.text.length <= MAX_SEGMENT_CHARACTERS)).toBe(true);
    expect(segments.every((segment) => segment.text.endsWith("."))).toBe(true);
  });
});

describe("segmentContext", () => {
  it("returns neighbouring text, trimmed, for smooth intonation", () => {
    const segments = segmentText("First part. ".repeat(200));
    const context = segmentContext(segments, 1);
    expect(context.previousText).toBe(segments[0].text.slice(-300));
    expect(segmentContext(segments, 0).previousText).toBeUndefined();
  });
});

describe("speakable", () => {
  it("reads arrows and page references naturally", () => {
    expect(speakable("upload → parse → read (see p. 4)")).toBe(
      "upload, then parse, then read (see page 4)",
    );
  });
});
