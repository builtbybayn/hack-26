import type { SynthesisEvidence } from "./synthesis";

export interface ResearchGap {
  id: string;
  sourceSynthesisCreatedAt: string;
  kind: "open_question" | "difference";
  theme: string;
  question: string;
  evidence: SynthesisEvidence[];
  counterEvidence: SynthesisEvidence[];
  documentIds: string[];
  searchTerms: string[];
}
