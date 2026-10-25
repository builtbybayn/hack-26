import type { ApiResponse, CommonErrorCode } from "./api";
import type { ParsedDocument } from "./ingestion";
import type { IntelligenceErrorCode } from "./intelligence";

export interface SynthesisAssessment {
  verdict: "supported" | "contradicted" | "unclear";
  reason: string;
}

export interface SynthesisEvidence {
  documentId: string;
  pageNumber: number;
  quote: string;
  assessment?: SynthesisAssessment;
}

export interface SynthesisFinding {
  kind: "agreement" | "difference" | "open_question";
  theme: string;
  summary: string;
  evidence: SynthesisEvidence[];
  assessment?: SynthesisAssessment;
}

export interface SynthesisReport {
  documentIds: string[];
  findings: SynthesisFinding[];
  warnings: string[];
  createdAt: string;
}

export interface SynthesisRequest {
  documents: ParsedDocument[];
}

export type SynthesisResponse = ApiResponse<
  SynthesisReport,
  IntelligenceErrorCode | CommonErrorCode
>;
