import { expect, it, vi } from "vitest";
import type { ParsedDocument } from "@/types/ingestion";
import { analyzePdfPreview } from "./pdf-preview";

const document = {
  id: "document-id",
  format: "pdf",
  sourceType: "pdf",
  source: { fileName: "study.pdf", mimeType: "application/pdf", sizeBytes: 1000 },
  title: "Study",
  text: "We conducted a randomized trial with 120 students. Retention scores improved after six weeks.",
  pages: [
    { pageNumber: 1, text: "We conducted a randomized trial with 120 students." },
    { pageNumber: 2, text: "Retention scores improved after six weeks." },
  ],
  sections: [],
  metadata: {},
  provenance: { parser: "standard", externalProcessing: false },
  stats: { characters: 95, words: 15, lines: 2 },
  warnings: [],
  parsedAt: "2026-10-25T00:00:00.000Z",
} satisfies ParsedDocument;

it("keeps only quotes on the cited PDF page", async () => {
  const generate = vi.fn().mockResolvedValue({
    methods: { pageNumber: 1, quote: "We conducted a randomized trial with 120 students." },
    sample: { pageNumber: 2, quote: "120 students" },
    measures: null,
    results: { pageNumber: 2, quote: "Retention scores improved after six weeks." },
    limitations: null,
  });
  const result = await analyzePdfPreview(
    {
      ...document,
      extractionQuality: {
        score: 0.3,
        needsOcr: true,
        reasons: ["Sparse text"],
        charactersPerPage: 20,
        readablePageRatio: 0.5,
      },
    },
    generate,
  );
  expect(result.fields.methods?.pageNumber).toBe(1);
  expect(result.fields.sample).toBeNull();
  expect(result.fields.results?.quote).toBe("Retention scores improved after six weeks.");
  expect(result.warnings).toContain("Removed an unverified sample quote.");
  expect(result.warnings).toContain("Some pages may be incomplete because this PDF needs OCR.");
});

it("rejects oversized extracted text before calling Gemini", async () => {
  const generate = vi.fn();
  await expect(
    analyzePdfPreview(
      { ...document, pages: [{ pageNumber: 1, text: "a".repeat(160_001) }] },
      generate,
    ),
  ).rejects.toMatchObject({ code: "MODEL_RESPONSE_INVALID" });
  expect(generate).not.toHaveBeenCalled();
});
