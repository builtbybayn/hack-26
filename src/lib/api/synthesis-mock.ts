import type { SynthesisCheckResponse, SynthesisResponse } from "@/types/synthesis";

export const MOCK_SYNTHESIS = {
  ok: true,
  data: {
    documentIds: ["paper-a", "paper-b"],
    findings: [
      {
        kind: "agreement",
        theme: "Accuracy",
        summary: "Both papers report improved accuracy.",
        assessment: { verdict: "supported", reason: "Both cited passages report improvement." },
        evidence: [
          {
            documentId: "paper-a",
            pageNumber: 1,
            quote: "Accuracy improved in adults.",
            assessment: { verdict: "supported", reason: "Paper A reports improvement." },
          },
          {
            documentId: "paper-b",
            pageNumber: 2,
            quote: "Accuracy improved in children.",
            assessment: { verdict: "supported", reason: "Paper B reports improvement." },
          },
        ],
      },
    ],
    warnings: [],
    createdAt: "2026-10-24T00:00:00.000Z",
  },
} satisfies SynthesisResponse;

export const MOCK_SYNTHESIS_CHECK = {
  ok: true,
  data: { findings: MOCK_SYNTHESIS.data.findings, warnings: [] },
} satisfies SynthesisCheckResponse;
