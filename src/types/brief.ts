import type { SynthesisFinding } from "./synthesis";
import type { PaperRecord } from "./research";
import type { ApiResponse, CommonErrorCode } from "./api";
import type { ParsedDocument } from "./ingestion";
import type { IntelligenceErrorCode } from "./intelligence";

export interface ResearchBrief {
  title: string;
  researchQuestion: string;
  researcherNotes: string;
  sourceSynthesisCreatedAt: string;
  documentIds: string[];
  findings: (SynthesisFinding & { included: boolean; edited: boolean; checkedSummary?: string })[];
  readingList: PaperRecord[];
  updatedAt: string;
}

export interface BriefCheckRequest {
  documents: ParsedDocument[];
  finding: SynthesisFinding;
}

export type BriefCheckResponse = ApiResponse<
  { finding: SynthesisFinding },
  IntelligenceErrorCode | CommonErrorCode
>;
