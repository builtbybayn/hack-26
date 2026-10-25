/**
 * Turns a published paper found by the scholarly search into a one-page document (its abstract),
 * so the contradiction check can compare against the wider literature, not only saved papers.
 * Browser-safe and pure. Quotes from it are verified against the abstract like any other page.
 */
import type { ParsedDocument } from "@/types/ingestion";
import type { PaperRecord } from "@/types/research";

/** Abstracts shorter than this rarely state a finding worth comparing. */
const MIN_ABSTRACT_CHARACTERS = 200;

export function literatureDocument(
  paper: PaperRecord,
  parsedAt = new Date().toISOString(),
): ParsedDocument | null {
  const abstract = paper.abstract?.replace(/\s+/g, " ").trim() ?? "";
  if (abstract.length < MIN_ABSTRACT_CHARACTERS) return null;
  return {
    id: paper.id,
    format: "text",
    sourceType: "text",
    source: { fileName: paper.url, mimeType: "text/plain", sizeBytes: abstract.length },
    title: paper.title,
    text: abstract,
    pages: [{ pageNumber: 1, text: abstract }],
    sections: [{ heading: "Abstract", level: 1, text: abstract, pageNumbers: [1] }],
    metadata: {
      pageCount: 1,
      ...(paper.authors.length ? { author: paper.authors.join(", ") } : {}),
    },
    provenance: { parser: "text", externalProcessing: false },
    stats: {
      characters: abstract.length,
      words: abstract.split(" ").length,
      lines: 1,
    },
    warnings: ["Abstract only: the full text was not available."],
    parsedAt,
  };
}
