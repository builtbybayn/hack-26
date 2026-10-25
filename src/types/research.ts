import type { ApiResponse, CommonErrorCode } from "./api";
import type { ParsedDocument } from "./ingestion";
import type { DocumentAnalysis, IntelligenceErrorCode } from "./intelligence";

/** Bibliographic fields come only from the scholarly provider. */
export interface PaperRecord {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  doi?: string;
  abstract?: string;
  url: string;
  openAccessPdfUrl?: string;
  citationCount?: number;
  /** Provider-scoped IDs of works this paper cites, when supplied by OpenAlex. */
  referencedWorkIds?: string[];
  provider: "openalex" | "semantic-scholar";
}

export interface PaperRecommendation {
  paper: PaperRecord;
  kind: "background" | "related";
  conceptIds: string[];
  reason: string | null;
}

export interface DocumentRecommendationsRequest {
  document: ParsedDocument;
  analysis: DocumentAnalysis;
  /** Defaults to 8, maximum 20. */
  limit?: number;
}

export interface TopicRecommendationsRequest {
  topic: string;
  /** Defaults to 8, maximum 20. */
  limit?: number;
}

export type RecommendationsRequest = DocumentRecommendationsRequest | TopicRecommendationsRequest;

export interface RecommendationsResult {
  recommendations: PaperRecommendation[];
  queries: {
    text: string;
    kind: PaperRecommendation["kind"];
    provider: PaperRecord["provider"];
    resultCount: number;
  }[];
  warnings: string[];
}

export interface SavedTopicSearch {
  id: string;
  topic: string;
  createdAt: string;
  result: RecommendationsResult;
}

export type ResearchErrorCode = "SEARCH_PROVIDER_ERROR" | "SEARCH_RATE_LIMITED";
export type RecommendationsResponse = ApiResponse<
  RecommendationsResult,
  ResearchErrorCode | IntelligenceErrorCode | CommonErrorCode
>;

export interface CitationReferencesRequest {
  paperIds: string[];
}

export type CitationReferencesResponse = ApiResponse<
  { references: Record<string, string[]> },
  ResearchErrorCode | CommonErrorCode
>;
