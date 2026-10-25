import type { ApiResponse, CommonErrorCode } from "./api";
import type { ParsedDocument } from "./ingestion";
import type { IntelligenceErrorCode } from "./intelligence";

export interface ReviewClaim {
  documentId: string;
  text: string;
  conditions: string;
  pageNumber: number;
  quote: string;
}

export type ReviewVerdict = "contradiction" | "compatible" | "unclear";

export interface ReviewFinding {
  topic: string;
  claims: [ReviewClaim, ReviewClaim];
  explanation: string;
  alternativeExplanations: string[];
  verdict: ReviewVerdict;
  review: { gemini: ReviewVerdict; grok: ReviewVerdict | "not_run" };
}

export interface ContradictionRequest {
  documents: [ParsedDocument, ParsedDocument];
}

export interface ContradictionReport {
  documentIds: [string, string];
  findings: ReviewFinding[];
  warnings: string[];
}

export type ContradictionResponse = ApiResponse<
  ContradictionReport,
  IntelligenceErrorCode | CommonErrorCode
>;
