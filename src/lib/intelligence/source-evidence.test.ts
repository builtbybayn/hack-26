import { describe, expect, it } from "vitest";
import type { DocumentAnalysis, EvidenceFeedback } from "@/types/intelligence";
import type { ParsedDocument } from "@/types/ingestion";
import {
  evidenceAgreement,
  evidenceEvaluationCases,
  evidenceFeedbackId,
  verifyAnalysisReferences,
} from "./source-evidence";

describe("concept source references", () => {
  it("keeps matching quotes and removes missing, wrong-page, and quote-free references", () => {
    const document = {
      pages: [
        { pageNumber: 1, text: "The measured field\n increased with temperature." },
        { pageNumber: 2, text: "A different result." },
      ],
    } as ParsedDocument;
    const analysis = {
      graph: {
        concepts: [
          {
            id: "field",
            name: "Field",
            sourceReferences: [
              { pageNumber: 1, quote: "field increased with temperature" },
              { pageNumber: 2, quote: "field increased with temperature" },
              { pageNumber: 1, quote: "invented quote" },
              { pageNumber: 1 },
            ],
          },
        ],
        repairs: [],
      },
    } as unknown as DocumentAnalysis;
    const verified = verifyAnalysisReferences(document, analysis);
    expect(verified.graph.concepts[0].sourceReferences).toEqual([
      { pageNumber: 1, quote: "field increased with temperature" },
    ]);
    expect(verified.graph.repairs).toEqual([
      {
        type: "unverified-quote",
        message: "Removed 3 unverified source references from “Field”.",
      },
    ]);
    expect(verifyAnalysisReferences(document, verified)).toBe(verified);
  });
});

describe("reader evidence review", () => {
  it("keeps corrections tied to a document, claim, and cited quote", () => {
    expect(evidenceFeedbackId("a", "Claim", { pageNumber: 1, quote: "Evidence" })).not.toBe(
      evidenceFeedbackId("b", "Claim", { pageNumber: 1, quote: "Evidence" }),
    );
  });

  it("counts agreement and exports claim-passage pairs for evaluation", () => {
    const document = {
      pages: [{ pageNumber: 1, text: "The measured field\n increased with temperature." }],
    } as ParsedDocument;
    const feedback = [
      {
        id: "1",
        documentId: "paper",
        claim: "The field increased.",
        pageNumber: 1,
        quote: "field increased with temperature",
        aiVerdict: "supported",
        correctedVerdict: "supported",
        updatedAt: "2026-01-01",
      },
      {
        id: "2",
        documentId: "paper",
        claim: "The field decreased.",
        pageNumber: 1,
        quote: "field increased with temperature",
        aiVerdict: "supported",
        correctedVerdict: "contradicted",
        updatedAt: "2026-01-01",
      },
    ] satisfies EvidenceFeedback[];
    expect(evidenceAgreement(feedback)).toEqual({
      reviewed: 2,
      agreed: 1,
      supportedReviewed: 2,
      supportedAgreed: 1,
    });
    expect(evidenceEvaluationCases(document, feedback)).toMatchObject([
      {
        index: 0,
        claim: "The field increased.",
        expectedVerdict: "supported",
        passage: "The measured field increased with temperature.",
      },
      { index: 1, claim: "The field decreased.", expectedVerdict: "contradicted" },
    ]);
  });
});
