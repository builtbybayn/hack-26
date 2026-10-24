import { beforeEach, describe, expect, it } from "vitest";
import type { ParsedDocument } from "@/types/ingestion";
import { clearStoreForTests, getDocument, putDocument } from "./document-store";

const document = {
  id: "hash",
  format: "text",
  sourceType: "text",
  source: { fileName: "a.txt", mimeType: "text/plain", sizeBytes: 1 },
  title: null,
  text: "a",
  pages: [{ pageNumber: 1, text: "a" }],
  sections: [{ heading: null, level: 0, text: "a" }],
  metadata: {},
  provenance: { parser: "text", externalProcessing: false },
  stats: { characters: 1, words: 1, lines: 1 },
  warnings: [],
  parsedAt: "2026-01-01T00:00:00Z",
} satisfies ParsedDocument;

describe("document cache", () => {
  beforeEach(clearStoreForTests);
  it("reuses documents by their content hash", () => {
    putDocument(document);
    expect(getDocument("hash")).toBe(document);
    expect(getDocument("different")).toBeUndefined();
  });
});
