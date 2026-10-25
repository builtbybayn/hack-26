/**
 * Intelligence contracts. The server is stateless: the browser stores parsed documents, analyses,
 * and mastery (see `@/lib/browser-store`) and sends whatever a request needs in its body.
 */
import type { ApiResponse, CommonErrorCode } from "./api";
import type { IngestionErrorCode, ParsedDocument } from "./ingestion";

export interface SourceReference {
  pageNumber: number;
  sectionId?: string;
  quote?: string;
}

export interface Concept {
  id: string;
  name: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedMinutes: number;
  sourceReferences: SourceReference[];
}

export interface Dependency {
  prerequisiteId: string;
  dependentId: string;
  evidenceType: "source" | "inferred";
  rationale: string;
}

export interface KnowledgeGraph {
  documentId: string;
  concepts: Concept[];
  dependencies: Dependency[];
}

export interface GraphRepair {
  type: "duplicate" | "invalid-reference" | "cycle" | "unverified-quote";
  message: string;
}

export interface ValidatedGraph extends KnowledgeGraph {
  topologicalOrder: string[];
  foundationalConceptIds: string[];
  downstreamCounts: Record<string, number>;
  repairs: GraphRepair[];
}

export interface DocumentUnderstanding {
  subject: string;
  topics: string[];
  terminology: string[];
  equations: string[];
  definitions: string[];
  learningObjectives: string[];
}

export type MasteryLevel = "unknown" | "learning" | "mastered";

export interface LearningPathItem {
  conceptId: string;
  priority: number;
  reason: string;
  blockedConceptCount: number;
}

export interface DocumentAnalysis {
  understanding: DocumentUnderstanding;
  graph: ValidatedGraph;
  learningPath: LearningPathItem[];
}

export interface ParseOptions {
  mode?: "automatic" | "standard" | "advanced";
  ocrProvider?: "mistral" | "mathpix";
  allowExternalProcessing?: boolean;
}

export type PipelineStage =
  | "extracting"
  | "ocr"
  | "concepts"
  | "prerequisites"
  | "validating"
  | "learning-path"
  | "completed"
  | "failed";

export interface ParseDocumentResult {
  document: ParsedDocument;
}

export interface AnalyzeRequest {
  document: ParsedDocument;
  mastery?: Record<string, MasteryLevel>;
}

export interface AnalyzeDocumentResult {
  analysis: DocumentAnalysis;
}

export interface ExplainRequest {
  /** Supplies the source pages the concept references. */
  document: ParsedDocument;
  concept: Concept;
  style: "beginner" | "technical" | "analogy" | "worked-example";
  question?: string;
}

export interface ExplainResult {
  sections: {
    text: string;
    sourceReference: (SourceReference & { quote: string }) | null;
    evidence: { verdict: "supported" | "contradicted" | "unclear"; reason: string } | null;
  }[];
}

export type EvidenceVerdict = "supported" | "contradicted" | "unclear";

export interface EvidenceFeedback {
  id: string;
  documentId: string;
  claim: string;
  pageNumber: number;
  quote: string;
  aiVerdict: EvidenceVerdict;
  correctedVerdict: EvidenceVerdict;
  updatedAt: string;
}

export interface QuizRequest {
  concept: Concept;
}

/** Includes the answer key: this is a self-check learning aid, graded without server state. */
export interface QuizQuestion {
  id: string;
  prompt: string;
  choices: string[];
  correctAnswer: string;
  explanation: string;
}

export interface QuizResult {
  conceptId: string;
  questions: QuizQuestion[];
}

export interface EvaluateRequest {
  quiz: QuizResult;
  /** Question id → chosen answer. */
  answers: Record<string, string>;
}

export interface EvaluateResult {
  score: number;
  passed: boolean;
  feedback: string;
  mastery: MasteryLevel;
}

export type IntelligenceErrorCode =
  | "CONSENT_REQUIRED"
  | "OCR_NOT_CONFIGURED"
  | "AI_NOT_CONFIGURED"
  | "PROVIDER_ERROR"
  | "MODEL_RESPONSE_INVALID"
  | "REQUEST_TIMEOUT";

export type ParseDocumentResponse = ApiResponse<
  ParseDocumentResult,
  IntelligenceErrorCode | CommonErrorCode | IngestionErrorCode
>;
export type AnalyzeDocumentResponse = ApiResponse<
  AnalyzeDocumentResult,
  IntelligenceErrorCode | CommonErrorCode
>;
export type ExplainResponse = ApiResponse<ExplainResult, IntelligenceErrorCode | CommonErrorCode>;
export type QuizResponse = ApiResponse<QuizResult, IntelligenceErrorCode | CommonErrorCode>;
export type EvaluateResponse = ApiResponse<EvaluateResult, IntelligenceErrorCode | CommonErrorCode>;
