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

/** Where a compared document came from: the user's saved papers or the published literature. */
export interface ContradictionSource {
  documentId: string;
  title: string;
  kind: "saved" | "literature";
  /** The provider's page for a published paper. */
  url?: string;
}

export interface ContradictionReport {
  documentIds: string[];
  findings: ContradictionFinding[];
  comparedClaimCount: number;
  warnings: string[];
  /**
   * Added by the browser (not the server) when the check includes published papers found online,
   * so results can name and link papers that aren't saved.
   */
  sources?: ContradictionSource[];
}

export type ContradictionResponse = ApiResponse<
  ContradictionReport,
  IntelligenceErrorCode | CommonErrorCode
>;
