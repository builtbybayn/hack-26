import type { ContradictionReport } from "@/types/contradictions";

export const MOCK_CONTRADICTION_REPORT = {
  documentIds: ["sample-paper-a", "sample-paper-b"],
  findings: [
    {
      id: "sample-finding-1",
      topic: "Treatment outcome",
      claims: [
        {
          documentId: "sample-paper-a",
          text: "The treatment improved the measured outcome.",
          conditions: "Adults; six-week follow-up; outcome measured on the same scale.",
          source: { pageNumber: 4, quote: "The treatment improved the measured outcome." },
        },
        {
          documentId: "sample-paper-b",
          text: "The treatment did not improve the measured outcome.",
          conditions: "Adults; six-week follow-up; outcome measured on the same scale.",
          source: { pageNumber: 7, quote: "The treatment did not improve the measured outcome." },
        },
      ],
      explanation: "The reported outcomes differ under comparable conditions.",
      alternativeExplanations: ["The samples may differ in unreported ways."],
      review: { gemini: "contradiction", grok: "contradiction" },
    },
  ],
  comparedClaimCount: 1,
  warnings: [],
} satisfies ContradictionReport;
