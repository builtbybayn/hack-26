import type { BriefCheckResponse } from "@/types/brief";

export const MOCK_BRIEF_CHECK = {
  ok: true,
  data: {
    finding: {
      kind: "agreement",
      theme: "Accuracy",
      summary: "Both papers report improved accuracy.",
      assessment: { verdict: "supported", reason: "Both passages report improvement." },
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
  },
} satisfies BriefCheckResponse;
