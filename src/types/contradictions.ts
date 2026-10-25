import type { ApiResponse, CommonErrorCode } from "./api";
import type { ParsedDocument } from "./ingestion";
import type { DocumentAnalysis, IntelligenceErrorCode, SourceReference } from "./intelligence";

export interface Claim {
  documentId: string;
  text: string;
  conditions: string;
  source: SourceReference & { quote: string };
}

export type Verdict = "contradiction" | "compatible" | "unclear";

export interface ContradictionFinding {
  id: string;
  topic: string;
  claims: [Claim, Claim];
  explanation: string;
  alternativeExplanations: string[];
  review: { gemini: Verdict; grok: Verdict | "not_run" };
}

export interface ContradictionRequest {
  documents: ParsedDocument[];
  analyses?: DocumentAnalysis[];
}

export interface ContradictionReport {
  documentIds: string[];
  findings: ContradictionFinding[];
  comparedClaimCount: number;
  warnings: string[];
}

export type ContradictionResponse = ApiResponse<
  ContradictionReport,
  IntelligenceErrorCode | CommonErrorCode
>;
