import { describe, expect, it, vi } from "vitest";
import type { ParsedDocument } from "@/types/ingestion";
import { compareDocuments, pairClaims } from "./compare";
import { quoteIsOnPage } from "./evidence";

function document(id: string, text: string): ParsedDocument {
  return {
    id,
    format: "pdf",
    sourceType: "pdf",
    source: { fileName: `${id}.pdf`, mimeType: "application/pdf", sizeBytes: 100 },
    title: id,
    text,
    pages: [{ pageNumber: 1, text }],
    sections: [{ heading: null, level: 0, text, pageNumbers: [1] }],
    metadata: { pageCount: 1 },
    provenance: { parser: "standard", externalProcessing: false },
    stats: { characters: text.length, words: 5, lines: 1 },
    warnings: [],
    parsedAt: "2026-01-01T00:00:00Z",
  };
}

describe("contradiction evidence and comparison", () => {
  it("checks the quote on the cited page with whitespace normalization", () => {
    const paper = document("one", "Response\n improved in the group.");
    expect(quoteIsOnPage(paper, { pageNumber: 1, quote: "Response improved" })).toBe(true);
    expect(quoteIsOnPage(paper, { pageNumber: 2, quote: "Response improved" })).toBe(false);
    expect(quoteIsOnPage(paper, { pageNumber: 1, quote: "Response declined" })).toBe(false);
  });

  it("pairs only claims from different papers on a shared topic", () => {
    const claim = (documentId: string) => ({
      documentId,
      text: "Outcome improved",
      conditions: "adults",
      source: { pageNumber: 1, quote: "Outcome improved" },
    });
    expect(
      pairClaims([
        { topic: "treatment outcome", claim: claim("a") },
        { topic: "treatment outcome", claim: claim("a") },
        { topic: "treatment outcome", claim: claim("b") },
        { topic: "weather pattern", claim: claim("c") },
      ]).map((pair) => pair.id),
    ).toEqual(["0-2", "1-2"]);
  });

  it("drops invented quotes and marks a single-model finding when Grok is absent", async () => {
    const first = document("a", "The treatment improved outcomes.");
    const second = document("b", "The treatment did not improve outcomes.");
    const extract = vi
      .fn()
      .mockResolvedValueOnce({
        claims: [
          {
            topic: "treatment outcomes",
            text: "improved",
            conditions: "adults",
            source: { pageNumber: 1, quote: "The treatment improved outcomes." },
          },
          {
            topic: "treatment outcomes",
            text: "invented",
            conditions: "adults",
            source: { pageNumber: 1, quote: "Not in the paper" },
          },
        ],
      })
      .mockResolvedValueOnce({
        claims: [
          {
            topic: "treatment outcomes",
            text: "did not improve",
            conditions: "adults",
            source: { pageNumber: 1, quote: "The treatment did not improve outcomes." },
          },
        ],
      });
    const review = vi.fn();
    const result = await compareDocuments({ documents: [first, second] }, undefined, {
      extract,
      judge: async () => ({
        judgments: [
          {
            pairId: "0-1",
            verdict: "contradiction",
            explanation: "Opposite results under comparable conditions.",
            alternativeExplanations: [],
          },
        ],
      }),
      review,
      grokConfigured: () => false,
    });
    expect(result.comparedClaimCount).toBe(1);
    expect(result.findings[0].review).toEqual({ gemini: "contradiction", grok: "not_run" });
    expect(result.warnings.join(" ")).toMatch(/discarded 1 claim.*Grok is not configured/);
    expect(review).not.toHaveBeenCalled();
  });

  it("keeps a disagreement visible as needing review", async () => {
    const first = document("a", "The treatment improved outcomes.");
    const second = document("b", "The treatment did not improve outcomes.");
    const review = vi.fn().mockResolvedValue({
      reviews: [{ pairId: "0-1", verdict: "unclear" }],
    });
    const result = await compareDocuments({ documents: [first, second] }, undefined, {
      extract: vi
        .fn()
        .mockResolvedValueOnce({
          claims: [
            {
              topic: "treatment outcomes",
              text: "improved",
              conditions: "adults",
              source: { pageNumber: 1, quote: "The treatment improved outcomes." },
            },
          ],
        })
        .mockResolvedValueOnce({
          claims: [
            {
              topic: "treatment outcomes",
              text: "did not improve",
              conditions: "adults",
              source: { pageNumber: 1, quote: "The treatment did not improve outcomes." },
            },
          ],
        }),
      judge: async () => ({
        judgments: [
          {
            pairId: "0-1",
            verdict: "contradiction",
            explanation: "Possible conflict",
            alternativeExplanations: [],
          },
        ],
      }),
      review,
      grokConfigured: () => true,
    });
    expect(review).toHaveBeenCalledTimes(1);
    expect(result.findings[0].review.grok).toBe("unclear");
  });
});
