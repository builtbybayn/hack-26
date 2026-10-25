import type { ApiResponse, CommonErrorCode } from "./api";
import type { IngestionErrorCode } from "./ingestion";
import type { IntelligenceErrorCode } from "./intelligence";

export const STUDY_FIELDS = ["methods", "sample", "measures", "results", "limitations"] as const;
export type StudyField = (typeof STUDY_FIELDS)[number];

export interface PdfStudyPreview {
  fileName: string;
  pageCount: number;
  fields: Record<StudyField, { pageNumber: number; quote: string } | null>;
  warnings: string[];
}

export type PdfStudyPreviewResponse = ApiResponse<
  PdfStudyPreview,
  IngestionErrorCode | IntelligenceErrorCode | CommonErrorCode
>;
