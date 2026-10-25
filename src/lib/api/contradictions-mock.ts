import type { ContradictionResponse } from "@/types/contradictions";

export const MOCK_CONTRADICTION_REPORT = {
  ok: true,
  data: {
    documentIds: ["paper-a", "paper-b"],
    findings: [],
    warnings: ["Mock review: no comparable claims found."],
  },
} satisfies ContradictionResponse;
