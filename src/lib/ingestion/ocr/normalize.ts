import { createHash } from "node:crypto";
import type { ParsedDocument, ParsedPage, ParserMethod } from "@/types/ingestion";
import type { PDFInput } from "../document-parser";

export function documentFromOcr(
  input: PDFInput,
  parser: ParserMethod,
  pages: ParsedPage[],
): ParsedDocument {
  const text = pages.map((page) => page.markdown ?? page.text).join("\n\n");
  const heading =
    /^#{1,6}\s+(.+)$/m.exec(text)?.[1]?.trim() ?? input.fileName.replace(/\.pdf$/i, "");
  return {
    id: input.documentId ?? createHash("sha256").update(input.bytes).digest("hex"),
    format: "pdf",
    sourceType: "pdf",
    source: {
      fileName: input.fileName,
      mimeType: input.mimeType ?? "application/pdf",
      sizeBytes: input.bytes.byteLength,
    },
    title: heading || null,
    text,
    pages,
    sections: pages.map((page) => ({
      id: `page-${page.pageNumber}`,
      heading: /^#{1,6}\s+(.+)$/m.exec(page.markdown ?? page.text)?.[1]?.trim() ?? null,
      level: 0,
      text: page.markdown ?? page.text,
      pageNumbers: [page.pageNumber],
    })),
    metadata: { pageCount: pages.length },
    provenance: { parser, externalProcessing: true },
    extractionQuality: {
      score: 1,
      needsOcr: false,
      reasons: [],
      charactersPerPage: text.length / Math.max(pages.length, 1),
      readablePageRatio: 1,
    },
    stats: {
      characters: text.length,
      words: text.split(/\s+/).filter(Boolean).length,
      lines: text.replace(/\n$/, "").split("\n").length,
    },
    warnings: [],
    parsedAt: new Date().toISOString(),
  };
}

export function extractLatex(markdown: string): string[] {
  return [...markdown.matchAll(/\$\$([\s\S]+?)\$\$|\$([^\n$]+?)\$/g)]
    .map((match) => (match[1] ?? match[2]).trim())
    .filter(Boolean);
}
